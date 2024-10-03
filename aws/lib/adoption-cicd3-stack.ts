import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as codepipeline from 'aws-cdk-lib/aws-codepipeline'
import * as codepipeline_actions from 'aws-cdk-lib/aws-codepipeline-actions'
import * as codebuild from 'aws-cdk-lib/aws-codebuild'
import * as ecr from 'aws-cdk-lib/aws-ecr'
import * as ecs from 'aws-cdk-lib/aws-ecs'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as codecommit from 'aws-cdk-lib/aws-codecommit'
import { aws_ec2 } from 'aws-cdk-lib'
import * as dotenv from 'dotenv'

dotenv.config()

export class CICD3Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // VPC
    const vpc = aws_ec2.Vpc.fromLookup(this, 'AdoptionImportedVpc', {
      vpcId: String(process.env.VPC_ID),
    })

    // ECRリポジトリを取得
    const repository = ecr.Repository.fromRepositoryName(
      this,
      'AdoptionECRBackend',
      String(process.env.ECR_NAME_ADOPTION_GO)
    )

    // ECSクラスターを取得
    const cluster = ecs.Cluster.fromClusterAttributes(this, 'AdoptionCluster', {
      clusterName: String(process.env.CLUSTER),
      vpc: vpc,
    })

    // CodeCommitリポジトリをHTTPSで指定
    const sourceRepo = codecommit.Repository.fromRepositoryName(
      this,
      'AdoptionCodeCommitRepo',
      String(process.env.CODECOMMIT_ADOPTION_GO)
    )

    const sourceOutput = new codepipeline.Artifact()
    const buildOutput = new codepipeline.Artifact()

    // CodeBuildプロジェクトの定義
    const buildProject = new codebuild.PipelineProject(this, 'BuildProject', {
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        privileged: true, // Dockerを使用するため
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '0.2',
        phases: {
          pre_build: {
            commands: [
              'echo Logging in to Amazon ECR...',
              `aws ecr get-login-password --region ${String(
                process.env.CDK_DEFAULT_REGION
              )} | docker login --username AWS --password-stdin ${String(
                process.env.ECR_URI_ADOPTION_GO
              )}`,
              `docker login --username ${process.env.DOCKERHUB_USERNAME} --password ${process.env.DOCKERHUB_PASSWORD}`,
            ],
          },
          build: {
            commands: [
              'echo Build started on `date`',
              `docker build -t ${String(
                process.env.ECR_URI_ADOPTION_GO
              )} -f ./Dockerfile .`,
              `docker push ${String(process.env.ECR_URI_ADOPTION_GO)}`,
            ],
          },
          post_build: {
            commands: [
              'echo Build completed on `date`',
              // imagedefinitions.jsonを生成する
              `printf '[{"name":"${String(
                process.env.BACKEND_CONTAINER_NAME
              )}","imageUri":"${String(
                process.env.ECR_URI_ADOPTION_GO
              )}"}]' > imagedefinitions.json`,
            ],
          },
        },
        artifacts: {
          files: ['imagedefinitions.json'],
          'base-directory': '.', // Dockerfileが存在するディレクトリを指定
        },
      }),
    })

    // ECRリポジトリへのフルアクセス権を付与する
    buildProject.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchGetImage',
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetAuthorizationToken',
          'ecr:PutImage',
          'ecr:InitiateLayerUpload',
          'ecr:UploadLayerPart',
          'ecr:CompleteLayerUpload',
        ],
        resources: ['*'],
      })
    )

    // CodePipelineの定義
    const pipeline = new codepipeline.Pipeline(this, 'AdoptionPipeline', {
      stages: [
        {
          stageName: 'Source',
          actions: [
            new codepipeline_actions.CodeCommitSourceAction({
              actionName: 'CodeCommit',
              repository: sourceRepo,
              branch: 'main',
              output: sourceOutput,
            }),
          ],
        },
        {
          stageName: 'Build',
          actions: [
            new codepipeline_actions.CodeBuildAction({
              actionName: 'CodeBuild',
              project: buildProject,
              input: sourceOutput,
              outputs: [buildOutput],
            }),
          ],
        },
        {
          stageName: 'Deploy',
          actions: [
            new codepipeline_actions.EcsDeployAction({
              actionName: 'ECSDeploy',
              service: ecs.FargateService.fromFargateServiceAttributes(
                this,
                'AdoptionService',
                {
                  serviceArn: String(process.env.ECS_BACKEND_ARN),
                  cluster,
                }
              ),
              input: buildOutput,
            }),
          ],
        },
      ],
    })

    // ECRリポジトリへのプッシュ権限をCodeBuildに付与
    repository.grantPullPush(buildProject.role!)
  }
}
