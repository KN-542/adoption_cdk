#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { AdoptionStack } from '../lib/adoption-ec2-stack'

const app = new cdk.App()
new AdoptionStack(app, 'AdoptionStack')
