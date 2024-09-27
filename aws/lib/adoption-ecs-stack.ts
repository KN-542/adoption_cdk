import * as cdk from 'aws-cdk-lib'
import { Stack, StackProps } from 'aws-cdk-lib'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as route53 from 'aws-cdk-lib/aws-route53'
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets'
import * as acm from 'aws-cdk-lib/aws-certificatemanager'
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

    // ECSサービスを作成
    const service = new ecs.FargateService(this, 'AdoptionFargateService', {
      cluster: cluster,
      taskDefinition: taskDefinition,
      desiredCount: 1, // 実行するタスク数
      assignPublicIp: true, // パブリックIPを付与する
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC, // パブリックサブネットを指定
      },
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

    // ターゲットグループを作成し、ECSサービスを登録
    const targetGroup = new elbv2.ApplicationTargetGroup(
      this,
      'AdoptionTargetGroup',
      {
        vpc: vpc,
        port: 3000, // ターゲットグループのポート
        protocol: elbv2.ApplicationProtocol.HTTP,
        targets: [
          service.loadBalancerTarget({
            containerName: 'AdoptionNextJsContainer',
            containerPort: 3000,
          }),
        ], // FargateServiceのターゲットを指定
        healthCheck: {
          path: '/', // ヘルスチェックのパスを指定
        },
      }
    )

    // Route 53のホストゾーンを取得
    const hostedZone = route53.HostedZone.fromLookup(
      this,
      'AdoptionHostedZone',
      {
        domainName: String(process.env.DOMAIN_NAME), // 登録済みドメイン名
      }
    )

    // サブドメイン用のSSL証明書をACMで作成
    const certificate = new acm.Certificate(this, 'AdoptionCertificate', {
      domainName: `${String(process.env.SUB_DOMAIN_NAME)}.${String(
        process.env.DOMAIN_NAME
      )}`,
      validation: acm.CertificateValidation.fromDns(hostedZone), // DNS検証で証明書を発行
    })

    // ALBのリスナーを作成（ポート80でリスニング）
    const listenerHttp = loadBalancer.addListener('AdoptionHttpListener', {
      port: 80, // ALBはポート80でリクエストを受ける
      defaultAction: elbv2.ListenerAction.redirect({
        protocol: 'HTTPS',
        port: '443',
        permanent: true, // HTTPSにリダイレクト
      }),
    })

    // ALBのリスナーを作成（ポート443でリスニング、証明書を追加）
    const listenerHttps = loadBalancer.addListener('AdoptionHttpsListener', {
      port: 443, // ALBはポート443でリクエストを受ける
      certificates: [certificate], // SSL証明書を使用
      defaultAction: elbv2.ListenerAction.fixedResponse(200, {
        contentType: 'text/plain',
        messageBody: 'OK',
      }),
    })

    // 許可するIPアドレスのリスト
    const allowedIps: string[] = [
      String(process.env.SG_IP),
      String(process.env.SG_IP2),
    ]

    // 許可するIPアドレスごとにルールを追加
    let priorityCounter = 1
    allowedIps.forEach((ip) => {
      listenerHttp.addAction(`AllowHttpIP-${ip}`, {
        priority: priorityCounter++,
        conditions: [elbv2.ListenerCondition.sourceIps([ip])],
        action: elbv2.ListenerAction.forward([targetGroup]),
      })

      listenerHttps.addAction(`AllowHttpsIP-${ip}`, {
        priority: priorityCounter++,
        conditions: [elbv2.ListenerCondition.sourceIps([ip])],
        action: elbv2.ListenerAction.forward([targetGroup]),
      })
    })

    // Route 53にALBのAレコードを作成
    new route53.ARecord(this, 'AdoptionAliasRecord', {
      zone: hostedZone,
      recordName: String(process.env.SUB_DOMAIN_NAME), // サブドメイン名
      target: route53.RecordTarget.fromAlias(
        new route53Targets.LoadBalancerTarget(loadBalancer)
      ),
    })
  }
}
