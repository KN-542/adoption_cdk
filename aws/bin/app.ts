#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { EcsStack } from '../lib/adoption-ecs-stack'
import { DBStack } from '../lib/adoption-rds-stack'
import { CICDStack } from '../lib/adoption-cicd-stack'
import { CICD2Stack } from '../lib/adoption-cicd2-stack'
import { CICD3Stack } from '../lib/adoption-cicd3-stack'

const app = new cdk.App()

const env = {
  account: String(process.env.CDK_DEFAULT_ACCOUNT),
  region: String(process.env.CDK_DEFAULT_REGION),
}

new DBStack(app, 'AdoptionDBStack', { env })

new EcsStack(app, 'AdoptionEcsStack', {
  env,
})

new CICDStack(app, 'AdoptionCICDStack', {
  env,
})
new CICD2Stack(app, 'AdoptionCICD2Stack', {
  env,
})
new CICD3Stack(app, 'AdoptionCICD3Stack', {
  env,
})

app.synth()
