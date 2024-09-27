import {
  aws_ec2,
  aws_rds,
  aws_elasticache,
  aws_logs,
  RemovalPolicy,
  Stack,
  StackProps,
  CfnOutput,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'

export class AuroraPostgresAndRedisWithBastionStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    //
    // VPC
    //

    const vpc = new aws_ec2.Vpc(this, 'AdoptionRDSVPC', {
      natGateways: 1, // 踏み台や他のリソースがインターネットにアクセス可能
      maxAzs: 2,
    })

    //
    // Security Groups
    //

    // データベース用セキュリティグループ
    const dbSecurityGroup = new aws_ec2.SecurityGroup(this, 'lpdevdbsg', {
      vpc: vpc,
      description: 'Allow PostgreSQL access',
      allowAllOutbound: true,
    })

    // Redis用セキュリティグループ
    const redisSecurityGroup = new aws_ec2.SecurityGroup(this, 'lpdevredissg', {
      vpc: vpc,
      description: 'Allow Redis access',
      allowAllOutbound: true,
    })

    // 踏み台サーバー用セキュリティグループ
    const bastionSecurityGroup = new aws_ec2.SecurityGroup(
      this,
      'lpdevbastionsg',
      {
        vpc: vpc,
        description: 'Allow SSH access to Bastion',
        allowAllOutbound: true,
      }
    )

    // データベースとRedisへの接続を許可 (踏み台経由)
    dbSecurityGroup.addIngressRule(
      bastionSecurityGroup,
      aws_ec2.Port.tcp(5432),
      'Allow PostgreSQL access from bastion'
    )

    redisSecurityGroup.addIngressRule(
      bastionSecurityGroup,
      aws_ec2.Port.tcp(6379),
      'Allow Redis access from bastion'
    )

    // 踏み台へのSSHアクセスを許可
    bastionSecurityGroup.addIngressRule(
      aws_ec2.Peer.ipv4(String(process.env.BASTION_IP || '0.0.0.0/0')),
      aws_ec2.Port.tcp(22),
      'Allow SSH access from trusted IP'
    )

    //
    // Bastion (踏み台サーバー)
    //

    const bastion = new aws_ec2.BastionHostLinux(this, 'lpdevbastion', {
      vpc: vpc,
      subnetSelection: { subnetType: aws_ec2.SubnetType.PUBLIC },
      securityGroup: bastionSecurityGroup,
    })

    //
    // Aurora PostgreSQL
    //

    const dbCluster = new aws_rds.DatabaseCluster(
      this,
      'lpdevaurorapostgrescluster',
      {
        engine: aws_rds.DatabaseClusterEngine.auroraPostgres({
          version: aws_rds.AuroraPostgresEngineVersion.VER_13_4,
        }),
        credentials: aws_rds.Credentials.fromGeneratedSecret('admin'), // Secrets Managerで自動生成
        defaultDatabaseName: 'wordpress_dev',
        instances: 2,
        instanceProps: {
          vpc,
          securityGroups: [dbSecurityGroup],
          instanceType: aws_ec2.InstanceType.of(
            aws_ec2.InstanceClass.T3,
            aws_ec2.InstanceSize.SMALL
          ),
          vpcSubnets: {
            subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED,
          },
        },
        cloudwatchLogsExports: ['error', 'general', 'slowquery'],
        cloudwatchLogsRetention: aws_logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY, // 開発用。削除時にDBも削除
      }
    )

    //
    // ElastiCache Redis
    //

    const redisSubnetGroup = new aws_elasticache.CfnSubnetGroup(
      this,
      'lpdevredissubnetgroup',
      {
        description: 'Subnet group for Redis',
        subnetIds: vpc.selectSubnets({
          subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED,
        }).subnetIds,
      }
    )

    const redisCluster = new aws_elasticache.CfnCacheCluster(
      this,
      'lpdevrediscluster',
      {
        engine: 'redis',
        cacheNodeType: 'cache.t3.micro',
        numCacheNodes: 1,
        vpcSecurityGroupIds: [redisSecurityGroup.securityGroupId],
        cacheSubnetGroupName: redisSubnetGroup.ref,
      }
    )

    //
    // Outputs
    //

    new CfnOutput(this, 'lpdevaurorapostgresendpoint', {
      value: dbCluster.clusterEndpoint.hostname,
    })

    new CfnOutput(this, 'lpdevredisendpoint', {
      value: redisCluster.attrRedisEndpointAddress,
    })

    new CfnOutput(this, 'lpdevbastionpublicip', {
      value: bastion.instancePublicIp,
    })
  }
}
