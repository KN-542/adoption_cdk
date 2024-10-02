import {
  aws_ec2,
  aws_rds,
  aws_elasticache,
  aws_logs,
  aws_secretsmanager,
  CfnOutput,
  RemovalPolicy,
  Stack,
  StackProps,
  aws_autoscaling,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as dotenv from 'dotenv'

dotenv.config()

type SecurityGroupOptions = {
  value: string
  http: boolean
  https: boolean
  ssh: boolean
  postgresql: boolean
  redis: boolean
  api: boolean
}

export class DBStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    //
    // VPC
    //

    const vpc = new aws_ec2.Vpc(this, 'AdoptionVPC', {
      natGateways: 0,
      maxAzs: 2,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'PublicSubnet',
          subnetType: aws_ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'PrivateSubnet',
          subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    })

    const IPs: SecurityGroupOptions[] = [
      {
        value: String(process.env.SG_IP),
        http: true,
        https: true,
        ssh: true,
        postgresql: true,
        redis: true,
        api: true,
      },
      {
        value: String(process.env.SG_IP2),
        http: true,
        https: true,
        ssh: true,
        postgresql: true,
        redis: true,
        api: true,
      },
    ]

    //
    // Security Groups
    //

    const dbSG = new aws_ec2.SecurityGroup(this, 'AdoptionDBSG', {
      vpc: vpc,
    })

    const redisSG = new aws_ec2.SecurityGroup(this, 'AdoptionRedisSG', {
      vpc: vpc,
    })

    const bastionSG = new aws_ec2.SecurityGroup(this, 'AdoptionBastionSG', {
      vpc: vpc,
    })

    for (const ip of IPs) {
      if (ip.postgresql)
        dbSG.addIngressRule(aws_ec2.Peer.ipv4(ip.value), aws_ec2.Port.tcp(5432))
      if (ip.redis)
        redisSG.addIngressRule(
          aws_ec2.Peer.ipv4(ip.value),
          aws_ec2.Port.tcp(6379)
        )
      if (ip.ssh)
        redisSG.addIngressRule(
          aws_ec2.Peer.ipv4(ip.value),
          aws_ec2.Port.tcp(22)
        )
    }

    dbSG.addIngressRule(
      bastionSG,
      aws_ec2.Port.tcp(5432),
      'Allow PostgreSQL access from bastion'
    )

    redisSG.addIngressRule(
      bastionSG,
      aws_ec2.Port.tcp(6379),
      'Allow Redis access from bastion'
    )

    //
    // Bastion (踏み台サーバー)
    //

    const bastion = new aws_ec2.Instance(this, 'AdoptionBastionHost', {
      vpc: vpc,
      vpcSubnets: { subnetType: aws_ec2.SubnetType.PUBLIC },
      securityGroup: bastionSG,
      instanceType: aws_ec2.InstanceType.of(
        aws_ec2.InstanceClass.T2,
        aws_ec2.InstanceSize.MICRO
      ),
      machineImage: new aws_ec2.AmazonLinuxImage({
        generation: aws_ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),
      keyName: 'key',
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: aws_ec2.BlockDeviceVolume.ebs(20, {
            deleteOnTermination: true,
            encrypted: true,
            volumeType: aws_ec2.EbsDeviceVolumeType.GP2,
          }),
        },
      ],
    })

    //
    // Aurora PostgreSQL (RDS)
    //

    const rdsParameterGroup = new aws_rds.ParameterGroup(
      this,
      'PostgresParameterGroup',
      {
        engine: aws_rds.DatabaseInstanceEngine.postgres({
          version: aws_rds.PostgresEngineVersion.VER_15,
        }),
        parameters: {
          log_statement: 'all',
          log_min_duration_statement: '5000',
        },
      }
    )

    const rds = new aws_rds.DatabaseInstance(
      this,
      'AdoptionAuroraPostgresCluster',
      {
        vpc: vpc,
        vpcSubnets: {
          subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED,
        },
        securityGroups: [dbSG],
        engine: aws_rds.DatabaseInstanceEngine.postgres({
          version: aws_rds.PostgresEngineVersion.VER_15,
        }),
        instanceType: aws_ec2.InstanceType.of(
          aws_ec2.InstanceClass.T3,
          aws_ec2.InstanceSize.SMALL
        ),
        databaseName: 'adoption',
        allocatedStorage: 20,
        storageEncrypted: true,
        cloudwatchLogsExports: ['postgresql'],
        cloudwatchLogsRetention: aws_logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
        parameterGroup: rdsParameterGroup,
      }
    )
    rds.connections.allowDefaultPortFrom(bastionSG)

    //
    // ElastiCache Redis
    //

    const redisSubnetGroup = new aws_elasticache.CfnSubnetGroup(
      this,
      'AdoptionRedisSubnetGroup',
      {
        description: 'Subnet group for Redis',
        subnetIds: vpc.selectSubnets({
          subnetType: aws_ec2.SubnetType.PRIVATE_ISOLATED, // Redisはプライベートサブネット
        }).subnetIds,
      }
    )

    const redisCluster = new aws_elasticache.CfnCacheCluster(
      this,
      'AdoptionRedisCluster',
      {
        engine: 'redis',
        cacheNodeType: 'cache.t3.micro',
        numCacheNodes: 1,
        vpcSecurityGroupIds: [redisSG.securityGroupId],
        cacheSubnetGroupName: redisSubnetGroup.ref,
      }
    )

    const redisSecret = new aws_secretsmanager.Secret(
      this,
      'AdoptionRedisSecret',
      {
        secretName: 'RedisConnectionSecret',
        generateSecretString: {
          secretStringTemplate: JSON.stringify({
            host: redisCluster.attrRedisEndpointAddress,
            port: 6379,
          }),
          generateStringKey: 'password',
        },
      }
    )

    //
    // Outputs
    //

    new CfnOutput(this, 'dbEndpoint', {
      value: rds.dbInstanceEndpointAddress,
    })

    new CfnOutput(this, 'dbSecretArn', {
      value: rds.secret!.secretArn,
    })

    new CfnOutput(this, 'redisEndpoint', {
      value: redisCluster.attrRedisEndpointAddress,
    })

    new CfnOutput(this, 'redisSecretArn', {
      value: redisSecret.secretArn,
    })

    new CfnOutput(this, 'bastionPublicIP', {
      value: bastion.instancePublicIp,
    })

    new CfnOutput(this, 'vpcId', {
      value: vpc.vpcId,
    })
  }
}
