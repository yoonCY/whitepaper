# Terraform — VPC 모듈
# 목적: Multi-AZ VPC 네트워크 기반 구성 (Public/Private Subnet, NAT GW, IGW)

variable "project_name" {
  description = "프로젝트 이름 (리소스 네이밍 접두사로 사용)"
  type        = string
}

variable "environment" {
  description = "환경 구분 (dev / staging / prod)"
  type        = string
}

variable "vpc_cidr" {
  description = "VPC CIDR 블록"
  type        = string
  default     = "10.0.0.0/16"
}

variable "azs" {
  description = "사용할 가용 영역 목록"
  type        = list(string)
  default     = ["ap-northeast-2a", "ap-northeast-2b", "ap-northeast-2c"]
}

variable "public_subnet_cidrs" {
  description = "퍼블릭 서브넷 CIDR 목록 (AZ 수와 동일하게)"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
}

variable "private_subnet_cidrs" {
  description = "프라이빗 서브넷 CIDR 목록 (AZ 수와 동일하게)"
  type        = list(string)
  default     = ["10.0.11.0/24", "10.0.12.0/24", "10.0.13.0/24"]
}

variable "enable_nat_gateway" {
  description = "NAT 게이트웨이 활성화 여부 (비용 절감을 위해 dev에서는 false 가능)"
  type        = bool
  default     = true
}

variable "single_nat_gateway" {
  description = "단일 NAT 게이트웨이 사용 (dev 환경 비용 절감용, prod에서는 false)"
  type        = bool
  default     = false
}

variable "tags" {
  description = "모든 리소스에 공통 적용할 태그"
  type        = map(string)
  default     = {}
}
