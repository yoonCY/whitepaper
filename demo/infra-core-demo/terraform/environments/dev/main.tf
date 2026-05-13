# Terraform — Dev 환경 진입점
# 목적: VPC → EKS → MSK → OpenSearch 순서로 모듈 체이닝
# 패턴: 환경별 tfvars + Remote State (S3 + DynamoDB Lock)

terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # Remote State: 팀 협업 및 State 잠금
  backend "s3" {
    bucket         = "infra-core-demo-tfstate-dev"     # 미리 생성 필요
    key            = "dev/terraform.tfstate"
    region         = "ap-northeast-2"
    encrypt        = true                               # 상태 파일 암호화
    dynamodb_table = "infra-core-demo-tflock-dev"       # State Lock 테이블
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = "dev"
      ManagedBy   = "terraform"
      Owner       = "platform-team"
    }
  }
}

# ──────────────────────────────────────────
# 로컬 변수
# ──────────────────────────────────────────
locals {
  env = "dev"
}

# ──────────────────────────────────────────
# 모듈 체이닝: VPC → EKS → MSK
# ──────────────────────────────────────────

# 1단계: 네트워크 기반
module "vpc" {
  source = "../../modules/vpc"

  project_name         = var.project_name
  environment          = local.env
  vpc_cidr             = var.vpc_cidr
  azs                  = var.azs
  public_subnet_cidrs  = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs

  # Dev: 비용 절감을 위해 단일 NAT GW 사용
  enable_nat_gateway = true
  single_nat_gateway = true
}

# 2단계: EKS 클러스터 (VPC 출력 참조)
module "eks" {
  source = "../../modules/eks"

  project_name       = var.project_name
  environment        = local.env
  cluster_version    = var.eks_cluster_version
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids

  # Dev: 소형 인스턴스 + Spot으로 비용 최소화
  node_groups = {
    app = {
      instance_types = ["t3.medium", "t3a.medium"]
      capacity_type  = "SPOT"
      min_size       = 1
      max_size       = 4
      desired_size   = 2
      disk_size      = 50
      labels         = { role = "app", env = "dev" }
      taints         = []
    }
  }
}

# 3단계: MSK Kafka (VPC 출력 참조)
module "msk" {
  source = "../../modules/msk"

  project_name       = var.project_name
  environment        = local.env
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids

  # Dev: 소형 브로커 인스턴스 (운영은 kafka.m5.large+)
  broker_instance_type = "kafka.t3.small"
  broker_storage_gb    = 20
  kafka_version        = var.kafka_version

  # EKS 프라이빗 서브넷 CIDR에서 접근 허용
  allowed_cidr_blocks = var.private_subnet_cidrs
}
