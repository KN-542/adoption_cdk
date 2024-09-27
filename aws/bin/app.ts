#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { AmplifyNextAppStack } from '../lib/adoption-amplify-stack'
import { EcsStack } from '../lib/adoption-ecs-stack'

const app = new cdk.App()

// new AmplifyNextAppStack(app, 'AdoptionAmplifyAppStack')
new EcsStack(app, 'AdoptionEcsStack')
