# Terraform — MSK (Managed Kafka) 메인 리소스
# 핵심 Failback 설정:
#   - 3 AZ × 1 브로커 = 3 브로커 (과반수 유지 가능)
#   - replication.factor=3, min.insync.replicas=2
#   - 1개 브로커 장애 시에도 생산/소비 계속 가능

locals {
  cluster_name = "${var.project_name}-${var.environment}"
  common_tags = merge(var.tags, {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  })
}

# ──────────────────────────────────────────
# MSK 클러스터 보안 그룹
# ──────────────────────────────────────────
resource "aws_security_group" "msk" {
  name        = "${local.cluster_name}-msk-sg"
  description = "MSK Kafka 클러스터 보안 그룹"
  vpc_id      = var.vpc_id

  # Kafka 플레인텍스트 (내부 전용, 비활성 권장)
  ingress {
    from_port   = 9092
    to_port     = 9092
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
    description = "Kafka 플레인텍스트 (개발용)"
  }

  # Kafka TLS 암호화 (운영 권장)
  ingress {
    from_port   = 9094
    to_port     = 9094
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
    description = "Kafka TLS 암호화 포트"
  }

  # Kafka SASL/SCRAM + TLS (인증 + 암호화)
  ingress {
    from_port   = 9096
    to_port     = 9096
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
    description = "Kafka SASL/SCRAM+TLS 포트"
  }

  # Zookeeper (MSK 내부 관리, 직접 접근 불필요)
  ingress {
    from_port   = 2181
    to_port     = 2181
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
    description = "Zookeeper (클러스터 내부 관리용)"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, { Name = "${local.cluster_name}-msk-sg" })
}

# ──────────────────────────────────────────
# MSK 클러스터 설정 (Kafka 설정 파라미터)
# ──────────────────────────────────────────
resource "aws_msk_configuration" "main" {
  name              = "${local.cluster_name}-kafka-config"
  kafka_versions    = [var.kafka_version]
  description       = "운영 수준 Kafka 설정"

  # 핵심 설정:
  # - auto.create.topics.enable=false: 토픽 명시적 생성 강제 (토픽 거버넌스)
  # - log.retention.hours=168: 7일 보관
  # - min.insync.replicas=2: Failback 핵심 — 2개 이상 ISR 없으면 쓰기 거부
  server_properties = <<-EOT
    auto.create.topics.enable=false
    default.replication.factor=3
    min.insync.replicas=2
    num.partitions=6
    log.retention.hours=168
    log.segment.bytes=1073741824
    log.retention.check.interval.ms=300000
    num.recovery.threads.per.data.dir=1
    offsets.topic.replication.factor=3
    transaction.state.log.min.isr=2
    transaction.state.log.replication.factor=3
    socket.receive.buffer.bytes=102400
    socket.request.max.bytes=104857600
    socket.send.buffer.bytes=102400
  EOT
}

# ──────────────────────────────────────────
# SASL/SCRAM 인증을 위한 시크릿 (AWS Secrets Manager)
# Zero-Trust: 평문 패스워드 대신 Secrets Manager 참조
# ──────────────────────────────────────────
resource "aws_secretsmanager_secret" "msk_credentials" {
  name                    = "${local.cluster_name}/msk/credentials"
  description             = "MSK SASL/SCRAM 인증 자격증명"
  recovery_window_in_days = 7

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "msk_credentials" {
  secret_id = aws_secretsmanager_secret.msk_credentials.id
  secret_string = jsonencode({
    username = "kafka-admin"
    # 실제 운영에서는 Secrets Manager에서 자동 로테이션 설정
    password = "CHANGE_ME_USE_SECRETS_ROTATION"
  })

  # 실제 운영에서는 이 리소스를 terraform에서 관리하지 않고
  # 별도 보안 프로세스로 초기화 후 lifecycle ignore 설정
  lifecycle {
    ignore_changes = [secret_string]
  }
}

# ──────────────────────────────────────────
# MSK 클러스터
# ──────────────────────────────────────────
resource "aws_msk_cluster" "main" {
  cluster_name           = "${local.cluster_name}-kafka"
  kafka_version          = var.kafka_version
  number_of_broker_nodes = var.broker_count_per_az * length(var.private_subnet_ids)
  configuration_info {
    arn      = aws_msk_configuration.main.arn
    revision = aws_msk_configuration.main.latest_revision
  }

  broker_node_group_info {
    instance_type   = var.broker_instance_type
    client_subnets  = var.private_subnet_ids
    security_groups = [aws_security_group.msk.id]

    storage_info {
      ebs_storage_info {
        volume_size = var.broker_storage_gb
        # 스토리지 자동 확장 (운영 중 디스크 부족 Failback)
        provisioned_throughput {
          enabled           = true
          volume_throughput = 250 # MiB/s
        }
      }
    }
  }

  # 클라이언트 인증: SASL/SCRAM + TLS
  client_authentication {
    sasl {
      scram = true
    }
    tls {
      # ACM Private CA 또는 AWS 관리 인증서 사용 가능
      # certificate_authority_arns = [var.acm_pca_arn]
    }
  }

  # 전송 중 암호화 (TLS 강제)
  encryption_info {
    encryption_in_transit {
      client_broker = "TLS"          # 클라이언트 ↔ 브로커: TLS만 허용
      in_cluster    = true           # 브로커 ↔ 브로커: 암호화
    }
  }

  # 모니터링: CloudWatch + Prometheus (MSK Open Monitoring)
  open_monitoring {
    prometheus {
      jmx_exporter {
        enabled_in_broker = true # Prometheus JMX 메트릭 수집
      }
      node_exporter {
        enabled_in_broker = true # 노드 레벨 메트릭
      }
    }
  }

  # 브로커 로그 → CloudWatch + S3 아카이브
  logging_info {
    broker_logs {
      cloudwatch_logs {
        enabled   = true
        log_group = aws_cloudwatch_log_group.msk.name
      }
      s3 {
        enabled = true
        bucket  = aws_s3_bucket.msk_logs.id
        prefix  = "msk-broker-logs/"
      }
    }
  }

  tags = local.common_tags
}

# ──────────────────────────────────────────
# CloudWatch 로그 그룹 (브로커 로그)
# ──────────────────────────────────────────
resource "aws_cloudwatch_log_group" "msk" {
  name              = "/aws/msk/${local.cluster_name}"
  retention_in_days = 30

  tags = local.common_tags
}

# ──────────────────────────────────────────
# S3 버킷 (장기 브로커 로그 아카이브)
# ──────────────────────────────────────────
resource "aws_s3_bucket" "msk_logs" {
  bucket        = "${local.cluster_name}-msk-logs-${data.aws_caller_identity.current.account_id}"
  force_destroy = var.environment != "prod" # prod 환경에서는 실수 삭제 방지

  tags = local.common_tags
}

resource "aws_s3_bucket_versioning" "msk_logs" {
  bucket = aws_s3_bucket.msk_logs.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "msk_logs" {
  bucket = aws_s3_bucket.msk_logs.id

  rule {
    id     = "archive-old-logs"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    expiration {
      days = 365
    }
  }
}

data "aws_caller_identity" "current" {}

# MSK SASL/SCRAM 사용자 등록
resource "aws_msk_scram_secret_association" "main" {
  cluster_arn     = aws_msk_cluster.main.arn
  secret_arn_list = [aws_secretsmanager_secret.msk_credentials.arn]

  depends_on = [aws_msk_cluster.main]
}
