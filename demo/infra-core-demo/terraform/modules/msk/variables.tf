# Terraform — MSK (Kafka) 모듈
# 패턴: Multi-AZ Managed Kafka + TLS + SASL/SCRAM 인증
# Failback: 3개 브로커 × 3 AZ, RF=3, min.insync.replicas=2

variable "project_name" { type = string }
variable "environment"  { type = string }
variable "vpc_id"       { type = string }

variable "private_subnet_ids" {
  description = "MSK 브로커가 배치될 프라이빗 서브넷 ID (AZ 수와 동일)"
  type        = list(string)
}

variable "kafka_version" {
  description = "Kafka 버전"
  type        = string
  default     = "3.6.0"
}

variable "broker_instance_type" {
  description = "브로커 인스턴스 타입"
  type        = string
  default     = "kafka.m5.large"
}

variable "broker_count_per_az" {
  description = "AZ당 브로커 수 (보통 1)"
  type        = number
  default     = 1
}

variable "broker_storage_gb" {
  description = "브로커당 EBS 스토리지 용량 (GB)"
  type        = number
  default     = 100
}

variable "allowed_cidr_blocks" {
  description = "Kafka 접근을 허용할 CIDR 블록 (EKS 노드 서브넷 CIDR)"
  type        = list(string)
}

variable "tags" {
  type    = map(string)
  default = {}
}
