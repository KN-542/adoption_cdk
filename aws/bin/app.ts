#!/usr/bin/env node
import 'source-map-support/register'
import * as cdk from 'aws-cdk-lib'
import { AdoptionEC2Stack } from '../lib/ec2-stack'

const app = new cdk.App()
new AdoptionEC2Stack(app, 'AdoptionEC2Stack')
