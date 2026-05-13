# VPC 모듈 출력값
# 다운스트림 모듈(EKS, MSK 등)이 참조하는 핵심 출력

output "vpc_id" {
  description = "생성된 VPC ID"
  value       = aws_vpc.main.id
}

output "vpc_cidr" {
  description = "VPC CIDR 블록"
  value       = aws_vpc.main.cidr_block
}

output "public_subnet_ids" {
  description = "퍼블릭 서브넷 ID 목록 (ALB, Bastion 배치용)"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "프라이빗 서브넷 ID 목록 (EKS 노드, MSK 배치용)"
  value       = aws_subnet.private[*].id
}

output "nat_gateway_ids" {
  description = "NAT 게이트웨이 ID 목록"
  value       = aws_nat_gateway.main[*].id
}

output "internet_gateway_id" {
  description = "인터넷 게이트웨이 ID"
  value       = aws_internet_gateway.main.id
}
