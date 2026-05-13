# Dev 환경 변수값 (dev.tfvars)
# 사용: terraform plan -var-file="dev.tfvars"

project_name = "infra-core"
aws_region   = "ap-northeast-2"

# Dev: 2 AZ만 사용 (비용 절감)
azs = ["ap-northeast-2a", "ap-northeast-2b"]

vpc_cidr             = "10.0.0.0/16"
public_subnet_cidrs  = ["10.0.1.0/24", "10.0.2.0/24"]
private_subnet_cidrs = ["10.0.11.0/24", "10.0.12.0/24"]

eks_cluster_version = "1.29"
kafka_version       = "3.6.0"
