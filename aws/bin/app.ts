#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { EcsStack } from '../lib/adoption-ecs-stack'
import { DBStack } from '../lib/adoption-rds-stack'

const app = new cdk.App()

const env = {
  account: String(process.env.CDK_DEFAULT_ACCOUNT),
  region: String(process.env.CDK_DEFAULT_REGION),
}

new DBStack(app, 'AdoptionDBStack', { env })

new EcsStack(app, 'AdoptionEcsStack', {
  env,
})

app.synth()
