import {
  aws_ec2,
  aws_ecs,
  aws_elasticloadbalancingv2,
  aws_iam,
  aws_route53,
  aws_route53_targets,
  aws_certificatemanager,
  CfnOutput,
  Stack,
  StackProps,
  Duration,
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
  front: boolean
  api: boolean
}

export class EcsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    const vpc = aws_ec2.Vpc.fromLookup(this, 'AdoptionImportedVpc', {
      vpcId: String(process.env.VPC_ID),
    })

    const IPs: SecurityGroupOptions[] = [
      {
        value: String(process.env.SG_IP),
        http: true,
        https: true,
        ssh: true,
        postgresql: true,
        redis: true,
        front: true,
        api: true,
      },
      {
        value: String(process.env.SG_IP2),
        http: true,
        https: true,
        ssh: true,
        postgresql: true,
        redis: true,
        front: true,
        api: true,
      },
    ]

    //
    // Security Groups
    //

    const albSG = new aws_ec2.SecurityGroup(this, 'AdoptionALBSG', {
      vpc: vpc,
    })
    const ecsSG = new aws_ec2.SecurityGroup(this, 'AdoptionECSSG', {
      vpc: vpc,
    })

    for (const ip of IPs) {
      if (ip.http)
        albSG.addIngressRule(aws_ec2.Peer.ipv4(ip.value), aws_ec2.Port.tcp(80))
      if (ip.https)
        albSG.addIngressRule(aws_ec2.Peer.ipv4(ip.value), aws_ec2.Port.tcp(443))
      if (ip.api)
        ecsSG.addIngressRule(
          aws_ec2.Peer.ipv4(ip.value),
          aws_ec2.Port.tcp(Number(process.env.BACKEND_CONTAINER_PORT))
        )
      if (ip.front)
        ecsSG.addIngressRule(
          aws_ec2.Peer.ipv4(ip.value),
          aws_ec2.Port.tcp(Number(process.env.FRONT_CONTAINER_PORT))
        )
      if (ip.postgresql)
        ecsSG.addIngressRule(
          aws_ec2.Peer.ipv4(ip.value),
          aws_ec2.Port.tcp(Number(process.env.POSTGRES_PORT))
        )
      if (ip.redis)
        ecsSG.addIngressRule(
          aws_ec2.Peer.ipv4(ip.value),
          aws_ec2.Port.tcp(Number(process.env.REDIS_PORT))
        )
    }

    //
    // ECS Setup for Frontend 1 (Next.js)
    //

    const ecsCluster = new aws_ecs.Cluster(this, 'AdoptionECSCluster', {
      vpc: vpc,
    })

    const frontendTaskDefinition1 = new aws_ecs.FargateTaskDefinition(
      this,
      'AdoptionFrontendTaskDef1',
      {
        executionRole: aws_iam.Role.fromRoleArn(
          this,
          'AdoptionFrontendExecutionRole1',
          String(process.env.ROLE_ARN)
        ),
      }
    )

    const frontendContainer1 = frontendTaskDefinition1.addContainer(
      'AdoptionFrontendContainer1',
      {
        containerName: String(process.env.FRONT_CONTAINER_NAME),
        image: aws_ecs.ContainerImage.fromRegistry(
          String(process.env.ECR_URI_ADOPTION_NEXTJS)
        ),
        memoryLimitMiB: 512,
        cpu: 256,
        logging: new aws_ecs.AwsLogDriver({
          streamPrefix: 'ecs-logs-frontend1',
        }),
      }
    )

    frontendContainer1.addPortMappings({
      containerPort: Number(process.env.FRONT_CONTAINER_PORT),
    })

    const frontendService1 = new aws_ecs.FargateService(
      this,
      'AdoptionFrontendService1',
      {
        cluster: ecsCluster,
        serviceName: String(process.env.FRONT_CONTAINER_NAME),
        taskDefinition: frontendTaskDefinition1,
        healthCheckGracePeriod: Duration.seconds(2147483647),
        desiredCount: 1,
        assignPublicIp: true,
        vpcSubnets: {
          subnetType: aws_ec2.SubnetType.PUBLIC,
        },
        securityGroups: [ecsSG],
      }
    )

    //
    // ECS Setup for Frontend 2 (Next.js)
    //

    const frontendTaskDefinition2 = new aws_ecs.FargateTaskDefinition(
      this,
      'AdoptionFrontendTaskDef2',
      {
        executionRole: aws_iam.Role.fromRoleArn(
          this,
          'AdoptionFrontendExecutionRole2',
          String(process.env.ROLE_ARN)
        ),
      }
    )

    const frontendContainer2 = frontendTaskDefinition2.addContainer(
      'AdoptionFrontendContainer2',
      {
        containerName: String(process.env.FRONT2_CONTAINER_NAME),
        image: aws_ecs.ContainerImage.fromRegistry(
          String(process.env.ECR_URI_ADOPTION_NEXTJS2)
        ),
        memoryLimitMiB: 512,
        cpu: 256,
        logging: new aws_ecs.AwsLogDriver({
          streamPrefix: 'ecs-logs-frontend2',
        }),
      }
    )

    frontendContainer2.addPortMappings({
      containerPort: Number(process.env.FRONT_CONTAINER_PORT),
    })

    const frontendService2 = new aws_ecs.FargateService(
      this,
      'AdoptionFrontendService2',
      {
        cluster: ecsCluster,
        serviceName: String(process.env.FRONT2_CONTAINER_NAME),
        taskDefinition: frontendTaskDefinition2,
        healthCheckGracePeriod: Duration.seconds(2147483647),
        desiredCount: 1,
        assignPublicIp: true,
        vpcSubnets: {
          subnetType: aws_ec2.SubnetType.PUBLIC, // ECSはパブリックサブネット
        },
        securityGroups: [ecsSG],
      }
    )

    //
    // ECS Setup for Backend (Go)
    //

    const backendTaskDefinition = new aws_ecs.FargateTaskDefinition(
      this,
      'AdoptionBackendTaskDef',
      {
        executionRole: aws_iam.Role.fromRoleArn(
          this,
          'AdoptionBackendExecutionRole',
          String(process.env.ROLE_ARN)
        ),
      }
    )

    const backendContainer = backendTaskDefinition.addContainer(
      'AdoptionBackendContainer',
      {
        containerName: String(process.env.BACKEND_CONTAINER_NAME),
        image: aws_ecs.ContainerImage.fromRegistry(
          String(process.env.ECR_URI_ADOPTION_GO)
        ),
        memoryLimitMiB: 256,
        cpu: 128,
        logging: new aws_ecs.AwsLogDriver({
          streamPrefix: 'ecs-logs-backend',
        }),
        environment: {
          GO_ENV: String(process.env.GO_ENV),
          API_DOMAIN: String(process.env.BACKEND_CONTAINER_NAME),
          JWT_SECRET: String(process.env.JWT_SECRET),
          JWT_SECRET2: String(process.env.JWT_SECRET2),
          JWT_SECRET3: String(process.env.JWT_SECRET3),
          FE_CSR_URL: `${String(process.env.PROTOCOL)}://${String(
            process.env.SUB_DOMAIN_NAME
          )}.${String(process.env.DOMAIN_NAME)}`,
          FE_SSG_URL: `${String(process.env.CONTAINER_PROTOCOL)}://${String(
            process.env.FRONT_CONTAINER_NAME
          )}:${String(process.env.FRONT_CONTAINER_PORT)}`,
          FE_APPLICANT_CSR_URL: `${String(process.env.PROTOCOL)}://${String(
            process.env.SUB_DOMAIN_NAME2
          )}.${String(process.env.DOMAIN_NAME)}`,
          FE_APPLICANT_SSG_URL: `${String(
            process.env.CONTAINER_PROTOCOL
          )}://${String(process.env.FRONT2_CONTAINER_NAME)}:${String(
            process.env.FRONT_CONTAINER_PORT
          )}`,
          INIT_USER_EMAIL: String(process.env.INIT_USER_EMAIL),
          AWS_REGION: String(process.env.AWS_REGION),
          AWS_ACCESS_KEY: String(process.env.AWS_ACCESS_KEY),
          AWS_SECRET_KEY: String(process.env.AWS_SECRET_KEY),
          AWS_S3_BUCKET_NAME: String(process.env.AWS_S3_BUCKET_NAME),
          AUTH_CLIENT_ID: String(process.env.AUTH_CLIENT_ID),
          AUTH_CLIENT_SECRET: String(process.env.AUTH_CLIENT_SECRET),
          AUTH_REDIRECT_URI_PATH: `${String(process.env.PROTOCOL)}://${String(
            process.env.SUB_DOMAIN_NAME
          )}.${String(process.env.DOMAIN_NAME)}/${String(
            process.env.AUTH_REDIRECT_URI_PATH
          )}`,
          AUTH_SCOPE_URI: String(process.env.AUTH_SCOPE_URI),
          REDIS_PORT: String(process.env.REDIS_PORT),
          REDIS_HOST: String(process.env.REDIS_HOST),
          POSTGRES_PORT: String(process.env.POSTGRES_PORT),
          POSTGRES_USER: String(process.env.POSTGRES_USER),
          POSTGRES_PASSWORD: String(process.env.POSTGRES_PASSWORD),
          POSTGRES_DB: String(process.env.POSTGRES_DB),
          POSTGRES_HOST: String(process.env.POSTGRES_HOST),
        },
      }
    )

    backendContainer.addPortMappings({
      containerPort: Number(process.env.BACKEND_CONTAINER_PORT),
    })

    const backendService = new aws_ecs.FargateService(
      this,
      'AdoptionBackendService',
      {
        cluster: ecsCluster,
        serviceName: String(process.env.BACKEND_CONTAINER_NAME),
        taskDefinition: backendTaskDefinition,
        healthCheckGracePeriod: Duration.seconds(2147483647),
        desiredCount: 1,
        assignPublicIp: true,
        vpcSubnets: {
          subnetType: aws_ec2.SubnetType.PUBLIC, // ECSはパブリックサブネット
        },
        securityGroups: [ecsSG],
      }
    )

    //
    // Application Load Balancer
    //

    const loadBalancer = new aws_elasticloadbalancingv2.ApplicationLoadBalancer(
      this,
      'AdoptionALB',
      {
        vpc: vpc,
        internetFacing: true,
        securityGroup: albSG,
      }
    )

    // Frontend 1 Target Group
    const frontendTargetGroup1 =
      new aws_elasticloadbalancingv2.ApplicationTargetGroup(
        this,
        'AdoptionFrontendTargetGroup1',
        {
          vpc: vpc,
          port: Number(process.env.FRONT_CONTAINER_PORT),
          protocol: aws_elasticloadbalancingv2.ApplicationProtocol.HTTP,
          targets: [
            frontendService1.loadBalancerTarget({
              containerName: String(process.env.FRONT_CONTAINER_NAME),
              containerPort: Number(process.env.FRONT_CONTAINER_PORT),
            }),
          ],
          healthCheck: {
            path: '/',
          },
        }
      )

    // Frontend 2 Target Group
    const frontendTargetGroup2 =
      new aws_elasticloadbalancingv2.ApplicationTargetGroup(
        this,
        'AdoptionFrontendTargetGroup2',
        {
          vpc: vpc,
          port: Number(process.env.FRONT_CONTAINER_PORT),
          protocol: aws_elasticloadbalancingv2.ApplicationProtocol.HTTP,
          targets: [
            frontendService2.loadBalancerTarget({
              containerName: String(process.env.FRONT2_CONTAINER_NAME),
              containerPort: Number(process.env.FRONT_CONTAINER_PORT),
            }),
          ],
          healthCheck: {
            path: '/',
          },
        }
      )

    // Backend Target Group
    const backendTargetGroup =
      new aws_elasticloadbalancingv2.ApplicationTargetGroup(
        this,
        'AdoptionBackendTargetGroup',
        {
          vpc: vpc,
          port: Number(process.env.BACKEND_CONTAINER_PORT),
          protocol: aws_elasticloadbalancingv2.ApplicationProtocol.HTTP,
          targets: [
            backendService.loadBalancerTarget({
              containerName: String(process.env.BACKEND_CONTAINER_NAME),
              containerPort: Number(process.env.BACKEND_CONTAINER_PORT),
            }),
          ],
          healthCheck: {
            path: '/health',
          },
        }
      )

    const hostedZone = aws_route53.HostedZone.fromLookup(
      this,
      'AdoptionHostedZone',
      {
        domainName: String(process.env.DOMAIN_NAME),
      }
    )

    // サブドメインごとに証明書を設定
    const certificate1 = new aws_certificatemanager.Certificate(
      this,
      'AdoptionCertificateFrontend1',
      {
        domainName: `${String(process.env.SUB_DOMAIN_NAME)}.${String(
          process.env.DOMAIN_NAME
        )}`,
        validation:
          aws_certificatemanager.CertificateValidation.fromDns(hostedZone),
      }
    )

    const certificate2 = new aws_certificatemanager.Certificate(
      this,
      'AdoptionCertificateFrontend2',
      {
        domainName: `${String(process.env.SUB_DOMAIN_NAME2)}.${String(
          process.env.DOMAIN_NAME
        )}`,
        validation:
          aws_certificatemanager.CertificateValidation.fromDns(hostedZone),
      }
    )

    const certificateBackend = new aws_certificatemanager.Certificate(
      this,
      'AdoptionCertificateBackend',
      {
        domainName: `${String(process.env.BACKEND_SUBDOMAIN_NAME)}.${String(
          process.env.DOMAIN_NAME
        )}`,
        validation:
          aws_certificatemanager.CertificateValidation.fromDns(hostedZone),
      }
    )

    loadBalancer.addListener('AdoptionListenerHttp', {
      port: 80,
      defaultAction: aws_elasticloadbalancingv2.ListenerAction.redirect({
        protocol: 'HTTPS',
        port: '443',
        permanent: true,
      }),
    })

    // HTTPSリスナーに証明書とサブドメインごとのルーティングを設定
    const listenerHttps = loadBalancer.addListener('AdoptionListenerHttps', {
      port: 443,
      certificates: [certificate1, certificate2, certificateBackend],
      defaultAction:
        aws_elasticloadbalancingv2.ListenerAction.fixedResponse(404),
    })

    listenerHttps.addAction('AdoptionSubDomain1Route', {
      priority: 10,
      conditions: [
        aws_elasticloadbalancingv2.ListenerCondition.hostHeaders([
          `${String(process.env.SUB_DOMAIN_NAME)}.${String(
            process.env.DOMAIN_NAME
          )}`,
        ]),
      ],
      action: aws_elasticloadbalancingv2.ListenerAction.forward([
        frontendTargetGroup1,
      ]),
    })

    listenerHttps.addAction('AdoptionSubDomain2Route', {
      priority: 20,
      conditions: [
        aws_elasticloadbalancingv2.ListenerCondition.hostHeaders([
          `${String(process.env.SUB_DOMAIN_NAME2)}.${String(
            process.env.DOMAIN_NAME
          )}`,
        ]),
      ],
      action: aws_elasticloadbalancingv2.ListenerAction.forward([
        frontendTargetGroup2,
      ]),
    })

    listenerHttps.addAction('AdoptionBackendSubDomainRoute', {
      priority: 30,
      conditions: [
        aws_elasticloadbalancingv2.ListenerCondition.hostHeaders([
          `${String(process.env.BACKEND_SUBDOMAIN_NAME)}.${String(
            process.env.DOMAIN_NAME
          )}`,
        ]),
      ],
      action: aws_elasticloadbalancingv2.ListenerAction.forward([
        backendTargetGroup,
      ]),
    })

    new aws_route53.ARecord(this, 'AdoptionAliasRecord1', {
      zone: hostedZone,
      recordName: String(process.env.SUB_DOMAIN_NAME),
      target: aws_route53.RecordTarget.fromAlias(
        new aws_route53_targets.LoadBalancerTarget(loadBalancer)
      ),
    })
    new aws_route53.ARecord(this, 'AdoptionAliasRecord2', {
      zone: hostedZone,
      recordName: String(process.env.SUB_DOMAIN_NAME2),
      target: aws_route53.RecordTarget.fromAlias(
        new aws_route53_targets.LoadBalancerTarget(loadBalancer)
      ),
    })
    new aws_route53.ARecord(this, 'AdoptionAliasRecordBackend', {
      zone: hostedZone,
      recordName: `${String(process.env.BACKEND_SUBDOMAIN_NAME)}.${String(
        process.env.DOMAIN_NAME
      )}`,
      target: aws_route53.RecordTarget.fromAlias(
        new aws_route53_targets.LoadBalancerTarget(loadBalancer)
      ),
    })

    //
    // Outputs
    //

    new CfnOutput(this, 'albDns', {
      value: loadBalancer.loadBalancerDnsName,
    })
  }
}
