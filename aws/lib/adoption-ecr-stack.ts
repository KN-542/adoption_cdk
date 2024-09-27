import * as cdk from 'aws-cdk-lib'
import * as ecr from 'aws-cdk-lib/aws-ecr'
import * as path from 'path'
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets'
import { Construct } from 'constructs'

export class EcrStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // ECRリポジトリを作成
    const repository = new ecr.Repository(this, 'AdoptionEcrRepo', {
      repositoryName: 'my-ecr-repo',
    })

    // ローカルのDockerイメージをビルドし、ECRにプッシュ
    const imageAsset = new DockerImageAsset(this, 'AdoptionDockerImage', {
      directory: path.join(__dirname, '../path-to-your-dockerfile'), // Dockerfileのパスを指定
    })

    // イメージURIを出力
    new cdk.CfnOutput(this, 'EcrRepoUri', {
      value: repository.repositoryUri,
    })
  }
}
