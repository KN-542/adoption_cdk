import * as cdk from 'aws-cdk-lib'
import { Stack, StackProps } from 'aws-cdk-lib'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import * as wafv2 from 'aws-cdk-lib/aws-wafv2'
import * as iam from 'aws-cdk-lib/aws-iam'
import { Construct } from 'constructs'
import * as dotenv from 'dotenv'

dotenv.config()

export class EcsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    // VPCを作成（パブリックサブネットのみ）
    const vpc = new ec2.Vpc(this, 'AdoptionVpc', {
      maxAzs: 2, // 利用するアベイラビリティゾーンの数
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'PublicSubnet',
          subnetType: ec2.SubnetType.PUBLIC, // パブリックサブネット
        },
      ],
    })

    // ECSクラスターを作成
    const cluster = new ecs.Cluster(this, 'AdoptionEcsCluster', {
      vpc: vpc,
    })

    // マネージメントコンソールで作成したIAMロールをCDKで参照
    const executionRole = iam.Role.fromRoleArn(
      this,
      'ECSExecutionRole',
      String(process.env.ROLE_ARN)
    )

    // Fargateタスク定義を作成
    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      'AdoptionTaskDef',
      {
        executionRole: executionRole, // マネージメントコンソールで作成したIAMロールを使用
      }
    )

    // ECRのDockerイメージを取得
    const container = taskDefinition.addContainer('AdoptionNextJsContainer', {
      image: ecs.ContainerImage.fromRegistry(
        String(process.env.ECR_URI_ADOPTION_NEXTJS)
      ),
      memoryLimitMiB: 512,
      cpu: 256,
      logging: new ecs.AwsLogDriver({
        streamPrefix: 'ecs-logs',
      }),
    })

    // ポートのマッピング
    container.addPortMappings({
      containerPort: 3000, // コンテナポートを3000に設定
    })

    // Application Load Balancerを作成
    const loadBalancer = new elbv2.ApplicationLoadBalancer(
      this,
      'AdoptionALB',
      {
        vpc: vpc,
        internetFacing: true, // インターネットに面したALB
      }
    )

    // ALBのリスナーを作成（ポート80でリスニング）
    const listener = loadBalancer.addListener('AdoptionListener', {
      port: 80, // ALBはポート80でリクエストを受ける
    })

    // ECSサービスを作成し、ALBにターゲットグループを紐付け
    const service = new ecs.FargateService(this, 'AdoptionFargateService', {
      cluster: cluster,
      taskDefinition: taskDefinition,
      desiredCount: 1, // 実行するタスク数
      assignPublicIp: true, // パブリックIPを付与する
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC, // パブリックサブネットを指定
      },
    })

    // ALBにFargateのターゲットグループを紐付け
    listener.addTargets('AdoptionECS', {
      port: 80, // ALBはポート80で受け取り
      targets: [service],
      healthCheck: {
        path: '/', // ヘルスチェックのパスを指定
        interval: cdk.Duration.seconds(30), // チェック間隔
        timeout: cdk.Duration.seconds(5), // タイムアウト
        healthyThresholdCount: 2, // 正常と見なす回数
        unhealthyThresholdCount: 2, // 異常と見なす回数
      },
    })

    // WAF で許可する IP アドレスリスト
    const allowedIps: string[] = [
      String(process.env.SG_IP),
      String(process.env.SG_IP2),
    ]

    // WAF IPセットを作成
    const ipSet = new wafv2.CfnIPSet(this, 'AdoptionIPSet', {
      addresses: allowedIps, // 許可するIP範囲を指定
      ipAddressVersion: 'IPV4',
      scope: 'REGIONAL', // リージョン単位のWAFを使用
      name: 'AllowedIPSet',
    })

    // WAF WebACLを作成し、IP制限ルールを追加
    const webAcl = new wafv2.CfnWebACL(this, 'WebACL', {
      defaultAction: { allow: {} }, // デフォルトアクションは許可
      scope: 'REGIONAL',
      rules: [
        {
          name: 'AllowSpecificIPs',
          priority: 1,
          action: { allow: {} }, // 許可ルール
          statement: {
            ipSetReferenceStatement: {
              arn: ipSet.attrArn, // 上で作成したIPセットを参照
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: 'AllowSpecificIPs',
            sampledRequestsEnabled: true,
          },
        },
      ],
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: 'WebACL',
        sampledRequestsEnabled: true,
      },
    })

    // WAFをALBに関連付け
    new wafv2.CfnWebACLAssociation(this, 'AdoptionWebACLAssociation', {
      resourceArn: loadBalancer.loadBalancerArn,
      webAclArn: webAcl.attrArn,
    })
  }
}
