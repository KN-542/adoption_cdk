import { aws_ec2, aws_iam, CfnOutput, Stack, StackProps } from 'aws-cdk-lib'

import { Construct } from 'constructs'
import * as dotenv from 'dotenv'

dotenv.config()

export class AdoptionStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    //
    // VPC
    //

    const vpc = new aws_ec2.Vpc(this, 'adoption-vpc', {
      natGateways: 0,
    })

    //
    // EC2
    //

    const ec2_sg = new aws_ec2.SecurityGroup(this, 'adoption-ec2-sg', {
      vpc: vpc,
    })

    const IPs = [
      process.env.SG_IP,
      process.env.SG_IP2,
      process.env.SG_IP3,
      process.env.SG_IP4,
    ]
    for (const ip of IPs) {
      ec2_sg.addIngressRule(
        aws_ec2.Peer.ipv4(String(ip)),
        aws_ec2.Port.tcp(22),
        `SSH Access from ${String(ip)}`
      )
      ec2_sg.addIngressRule(
        aws_ec2.Peer.ipv4(String(ip)),
        aws_ec2.Port.tcp(80),
        `HTTP Access from ${String(ip)}`
      )
      ec2_sg.addIngressRule(
        aws_ec2.Peer.ipv4(String(ip)),
        aws_ec2.Port.tcp(5432),
        `PostgreSQL Access from ${String(ip)}`
      )
      ec2_sg.addIngressRule(
        aws_ec2.Peer.ipv4(String(ip)),
        aws_ec2.Port.tcp(3000),
        `Frontend Access from ${String(ip)}`
      )
      ec2_sg.addIngressRule(
        aws_ec2.Peer.ipv4(String(ip)),
        aws_ec2.Port.tcp(3001),
        `Frontend2 Access from ${String(ip)}`
      )
      ec2_sg.addIngressRule(
        aws_ec2.Peer.ipv4(String(ip)),
        aws_ec2.Port.tcp(8080),
        `Backend Access from ${String(ip)}`
      )
      ec2_sg.addIngressRule(
        aws_ec2.Peer.ipv4(String(ip)),
        aws_ec2.Port.tcp(8081),
        `Batch Access from ${String(ip)}`
      )
      ec2_sg.addIngressRule(
        aws_ec2.Peer.ipv4(String(ip)),
        aws_ec2.Port.tcp(6379),
        `Redis Access from ${String(ip)}`
      )
      ec2_sg.addIngressRule(
        aws_ec2.Peer.ipv4(String(ip)),
        aws_ec2.Port.tcp(8001),
        `RedisInsight Access from ${String(ip)}`
      )
    }

    const ec2_role = new aws_iam.Role(this, 'adoption-role', {
      assumedBy: new aws_iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
          'AmazonSSMManagedInstanceCore'
        ),
      ],
    })

    const ec2_user_data = new aws_ec2.MultipartUserData()
    const ec2_command = aws_ec2.UserData.forLinux()
    ec2_user_data.addUserDataPart(
      ec2_command,
      aws_ec2.MultipartBody.SHELL_SCRIPT,
      true
    )
    ec2_command.addCommands(
      '#!/bin/bash',
      '',
      'yum update -y',
      // Git
      'yum install -y git',
      // Docker
      'yum install -y docker',
      'systemctl start docker',
      'systemctl enable docker',
      'chmod 666 /var/run/docker.sock',
      // docker-compose
      'mkdir -p /usr/local/lib/docker/cli-plugins',
      'VER=2.4.1',
      'curl -L https://github.com/docker/compose/releases/download/v${VER}/docker-compose-$(uname -s)-$(uname -m) -o /usr/local/lib/docker/cli-plugins/docker-compose',
      'chmod +x /usr/local/lib/docker/cli-plugins/docker-compose',
      'ln -s /usr/local/lib/docker/cli-plugins/docker-compose /usr/bin/docker-compose'
    )

    const ec2 = new aws_ec2.Instance(this, 'adoption', {
      vpc: vpc,
      vpcSubnets: { subnetType: aws_ec2.SubnetType.PUBLIC },
      securityGroup: ec2_sg,

      instanceType: aws_ec2.InstanceType.of(
        aws_ec2.InstanceClass.T3,
        aws_ec2.InstanceSize.SMALL
      ),
      machineImage: new aws_ec2.AmazonLinuxImage({
        generation: aws_ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      }),

      role: ec2_role,
      keyName: 'key',
      userData: ec2_user_data,
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: aws_ec2.BlockDeviceVolume.ebs(160, {
            deleteOnTermination: true,
            encrypted: true,
            volumeType: aws_ec2.EbsDeviceVolumeType.GP2,
          }),
        },
      ],
    })

    new CfnOutput(this, 'adoption-ec2-output', {
      value: ec2.instancePublicIp,
    })
  }
}
