import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export class SigNozCloudAgent {
    agentRoleArn: pulumi.Output<string>;
    firehoseRoleArn: pulumi.Output<string>;
    firehoseWriterRoleArn: pulumi.Output<string>;
    forwarderRoleArn: pulumi.Output<string>;

    constructor(clusterName: string, accountId: string, region: string) {
        const forwarderRole = new aws.iam.Role(`signoz-forwarder-access-${clusterName}`, {
            name: `signoz-forwarder-access-${clusterName}`,
            description: "Required access for signoz-forwarder lambda function",
            assumeRolePolicy: JSON.stringify({
                Version: "2012-10-17",
                Statement: [{
                    Effect: "Allow",
                    Principal: { Service: "lambda.amazonaws.com" },
                    Action: "sts:AssumeRole",
                }],
            }),
            managedPolicyArns: [
                "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
            ],
            inlinePolicies: [{
                name: "LambdaS3Access",
                policy: JSON.stringify({
                    Version: "2012-10-17",
                    Statement: [{
                        Effect: "Allow",
                        Action: "s3:GetObject",
                        Resource: "arn:aws:s3:::*",
                    }],
                }),
            }],
            tags: { integration: "signoz" },
        });

        const firehoseRole = new aws.iam.Role(`signoz-firehose-stream-${clusterName}`, {
            name: `signoz-integration-firehose-stream-${clusterName}`,
            description: "Role used by firehose delivery streams for sending cloudwatch metrics and logs to SigNoz",
            assumeRolePolicy: JSON.stringify({
                Version: "2012-10-17",
                Statement: [{
                    Effect: "Allow",
                    Principal: { Service: "firehose.amazonaws.com" },
                    Action: "sts:AssumeRole",
                }],
            }),
            inlinePolicies: [{
                name: "signoz-integration-firehose-s3-writer",
                policy: JSON.stringify({
                    Version: "2012-10-17",
                    Statement: [{
                        Effect: "Allow",
                        Action: [
                            "s3:AbortMultipartUpload",
                            "s3:GetBucketLocation",
                            "s3:GetObject",
                            "s3:ListBucket",
                            "s3:ListBucketMultipartUploads",
                            "s3:PutObject",
                        ],
                        Resource: ["arn:aws:s3:::signoz*"],
                    }],
                }),
            }],
            tags: { integration: "signoz" },
        });

        const firehoseWriterRole = new aws.iam.Role(`signoz-firehose-writer-${clusterName}`, {
            name: `signoz-integration-firehose-writer-${clusterName}`,
            description: "Role used for writing to firehose streams delivering to SigNoz",
            assumeRolePolicy: JSON.stringify({
                Version: "2012-10-17",
                Statement: [{
                    Effect: "Allow",
                    Principal: {
                        Service: [
                            "streams.metrics.cloudwatch.amazonaws.com",
                            "logs.amazonaws.com",
                        ],
                    },
                    Action: "sts:AssumeRole",
                }],
            }),
            inlinePolicies: [{
                name: "signoz-integration-firehose-writer",
                policy: JSON.stringify({
                    Version: "2012-10-17",
                    Statement: [{
                        Effect: "Allow",
                        Action: [
                            "firehose:PutRecord",
                            "firehose:PutRecordBatch",
                        ],
                        Resource: [`arn:aws:firehose:*:${accountId}:deliverystream/signoz-*`],
                    }],
                }),
            }],
            tags: { integration: "signoz" },
        });

        const agentRole = new aws.iam.Role(`signoz-integration-agent-${clusterName}`, {
            name: `signoz-integration-agent-${clusterName}`,
            description: "Role used by SigNoz integration agent to manage telemetry collection",
            assumeRolePolicy: JSON.stringify({
                Version: "2012-10-17",
                Statement: [{
                    Effect: "Allow",
                    Principal: { Service: "pods.eks.amazonaws.com" },
                    Action: [
                        "sts:AssumeRole",
                        "sts:TagSession",
                    ],
                }],
            }),
            inlinePolicies: [
                {
                    name: "signoz-integration-regions-reader",
                    policy: JSON.stringify({
                        Version: "2012-10-17",
                        Statement: [{
                            Effect: "Allow",
                            Action: ["account:ListRegions"],
                            Resource: [`arn:aws:account::${accountId}:account`],
                        }],
                    }),
                },
                {
                    name: "signoz-integration-s3-buckets-manager",
                    policy: JSON.stringify({
                        Version: "2012-10-17",
                        Statement: [
                            {
                                Effect: "Allow",
                                Action: ["s3:*"],
                                Resource: ["arn:aws:s3:::signoz*"],
                            },
                            {
                                Effect: "Allow",
                                Action: ["s3:PutBucketNotification"],
                                Resource: ["arn:aws:s3:::*"],
                            },
                        ],
                    }),
                },
                {
                    name: "signoz-integration-ecr-manager",
                    policy: JSON.stringify({
                        Version: "2012-10-17",
                        Statement: [
                            {
                                Effect: "Allow",
                                Action: "ecr:*",
                                Resource: ["arn:aws:ecr:*:*:repository/signoz/*"],
                            },
                            {
                                Effect: "Allow",
                                Action: "ecr:GetAuthorizationToken",
                                Resource: "*",
                            },
                        ],
                    }),
                },
                {
                    name: "signoz-integration-firehose-manager",
                    policy: JSON.stringify({
                        Version: "2012-10-17",
                        Statement: [{
                            Effect: "Allow",
                            Action: "firehose:*",
                            Resource: [`arn:aws:firehose:*:${accountId}:deliverystream/signoz*`],
                        }],
                    }),
                },
                {
                    name: "signoz-integration-metric-streams-manager",
                    policy: JSON.stringify({
                        Version: "2012-10-17",
                        Statement: [{
                            Effect: "Allow",
                            Action: [
                                "cloudwatch:ListMetricStreams",
                                "cloudwatch:GetMetricStream",
                                "cloudwatch:PutMetricStream",
                                "cloudwatch:DeleteMetricStream",
                                "cloudwatch:StartMetricStreams",
                                "cloudwatch:StopMetricStreams",
                            ],
                            Resource: [`arn:aws:cloudwatch:*:${accountId}:metric-stream/signoz*`],
                        }],
                    }),
                },
                {
                    name: "signoz-integration-cw-logs-subscription-manager",
                    policy: JSON.stringify({
                        Version: "2012-10-17",
                        Statement: [{
                            Effect: "Allow",
                            Action: [
                                "logs:DescribeLogGroups",
                                "logs:DescribeSubscriptionFilters",
                                "logs:PutSubscriptionFilter",
                                "logs:DeleteSubscriptionFilter",
                            ],
                            Resource: "*",
                        }],
                    }),
                },
                {
                    name: "signoz-integration-cw-logs-writer",
                    policy: JSON.stringify({
                        Version: "2012-10-17",
                        Statement: [{
                            Effect: "Allow",
                            Action: [
                                "logs:CreateLogStream",
                                "logs:PutLogEvents",
                            ],
                            Resource: "*",
                        }],
                    }),
                },
                {
                    name: "signoz-integration-lambda-manager",
                    policy: JSON.stringify({
                        Version: "2012-10-17",
                        Statement: [{
                            Effect: "Allow",
                            Action: ["lambda:*"],
                            Resource: [`arn:aws:lambda:*:${accountId}:function:signoz-*`],
                        }],
                    }),
                },
                {
                    name: "signoz-integration-event-bridge-rule-manager",
                    policy: JSON.stringify({
                        Version: "2012-10-17",
                        Statement: [{
                            Effect: "Allow",
                            Action: ["events:*"],
                            Resource: [`arn:aws:events:*:${accountId}:rule/signoz-*`],
                        }],
                    }),
                },
                {
                    name: "signoz-integration-agent-pass-roles",
                    policy: pulumi.all([
                        forwarderRole.arn,
                        firehoseRole.arn,
                        firehoseWriterRole.arn,
                    ]).apply(([forwarderArn, firehoseArn, firehoseWriterArn]) =>
                        JSON.stringify({
                            Version: "2012-10-17",
                            Statement: [{
                                Effect: "Allow",
                                Action: "iam:PassRole",
                                Resource: [firehoseArn, firehoseWriterArn, forwarderArn],
                            }],
                        }),
                    ),
                },
            ],
            tags: { integration: "signoz" },
        });

        new aws.eks.PodIdentityAssociation(`signoz-cloud-agent-pod-identity-${clusterName}`, {
            clusterName: clusterName,
            namespace: "signoz-cloud-agent",
            serviceAccount: "signoz-cloud-agent",
            roleArn: agentRole.arn,
        });

        this.agentRoleArn = agentRole.arn;
        this.firehoseRoleArn = firehoseRole.arn;
        this.firehoseWriterRoleArn = firehoseWriterRole.arn;
        this.forwarderRoleArn = forwarderRole.arn;
    }
}
