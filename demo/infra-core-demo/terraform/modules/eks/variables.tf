# Terraform — EKS 모듈 변수 정의
# 목적: 관리형 Kubernetes 클러스터 (Managed Node Group + Spot 지원)

variable "project_name" {
  description = "프로젝트 이름"
  type        = string
}

variable "environment" {
  description = "환경 구분 (dev / staging / prod)"
  type        = string
}

variable "cluster_version" {
  description = "Kubernetes 버전"
  type        = string
  default     = "1.29"
}

variable "vpc_id" {
  description = "EKS 클러스터를 배치할 VPC ID"
  type        = string
}

variable "private_subnet_ids" {
  description = "EKS 노드가 위치할 프라이빗 서브넷 ID 목록"
  type        = list(string)
}

variable "node_groups" {
  description = "관리형 노드 그룹 설정 맵"
  type = map(object({
    instance_types = list(string)
    capacity_type  = string # ON_DEMAND 또는 SPOT
    min_size       = number
    max_size       = number
    desired_size   = number
    disk_size      = number
    labels         = map(string)
    taints = list(object({
      key    = string
      value  = string
      effect = string
    }))
  }))
  default = {
    # 시스템 컴포넌트 전용 노드 (안정적 ON_DEMAND)
    system = {
      instance_types = ["m6i.large"]
      capacity_type  = "ON_DEMAND"
      min_size       = 2
      max_size       = 4
      desired_size   = 2
      disk_size      = 50
      labels         = { role = "system" }
      taints         = []
    }
    # 애플리케이션 워크로드 노드 (비용 효율 SPOT)
    app = {
      instance_types = ["m6i.xlarge", "m6a.xlarge", "m5.xlarge"]
      capacity_type  = "SPOT"
      min_size       = 1
      max_size       = 10
      desired_size   = 2
      disk_size      = 100
      labels         = { role = "app" }
      taints         = []
    }
  }
}

variable "cluster_addons" {
  description = "활성화할 EKS 클러스터 애드온 목록"
  type        = map(string)
  default = {
    coredns            = "v1.11.1-eksbuild.4"
    kube-proxy         = "v1.29.1-eksbuild.2"
    vpc-cni            = "v1.16.3-eksbuild.2"
    aws-ebs-csi-driver = "v1.28.0-eksbuild.1"
  }
}

variable "tags" {
  description = "공통 태그"
  type        = map(string)
  default     = {}
}
