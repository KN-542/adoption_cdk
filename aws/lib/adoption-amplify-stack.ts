import * as cdk from 'aws-cdk-lib'
import { Stack, StackProps } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as amplify from '@aws-cdk/aws-amplify-alpha'
import * as codecommit from 'aws-cdk-lib/aws-codecommit'
import * as wafv2 from 'aws-cdk-lib/aws-wafv2'
import * as dotenv from 'dotenv'

dotenv.config()

export class AmplifyNextAppStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    // CodeCommit リポジトリの定義
    const repository = codecommit.Repository.fromRepositoryName(
      this,
      'Adoption',
      'adoption_nextjs'
    )

    // Amplify アプリケーションの定義
    const amplifyApp = new amplify.App(this, 'AdoptionAmplify', {
      sourceCodeProvider: new amplify.CodeCommitSourceCodeProvider({
        repository,
      }),
    })

    // ブランチの設定
    const mainBranch = amplifyApp.addBranch('main') // または 'master'

    // WAF で許可する IP アドレスリスト（例: 203.0.113.0/24）
    const allowedIps: string[] = [
      String(process.env.SG_IP),
      String(process.env.SG_IP2),
      // String(process.env.SG_IP3),
      // String(process.env.SG_IP4),
    ]

    // WAF Web ACL の定義
    const webAcl = new wafv2.CfnWebACL(this, 'AdoptionWebACL', {
      defaultAction: {
        block: {}, // デフォルトではすべてのアクセスをブロック
      },
      scope: 'REGIONAL',
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'WebACL',
      },
      rules: [
        {
          name: 'AdoptionAllowSpecificIP',
          priority: 1,
          action: { allow: {} }, // 許可ルール
          statement: {
            ipSetReferenceStatement: {
              arn: new wafv2.CfnIPSet(this, 'AdoptionAllowedIPSet', {
                addresses: allowedIps,
                ipAddressVersion: 'IPV4',
                scope: 'REGIONAL',
              }).attrArn,
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'AdoptionAllowedIPSet',
          },
        },
      ],
    })

    // Amplify の CloudFront ディストリビューションに WAF Web ACL を適用
    mainBranch.addEnvironment('CLOUDFRONT_WAF_WEB_ACL_ID', webAcl.attrArn)

    // 結果を出力
    new cdk.CfnOutput(this, 'WebAclArn', {
      value: webAcl.attrArn,
    })
  }
}
