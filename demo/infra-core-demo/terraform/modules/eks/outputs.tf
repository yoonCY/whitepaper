output "cluster_id" {
  description = "EKS 클러스터 ID"
  value       = aws_eks_cluster.main.id
}

output "cluster_name" {
  description = "EKS 클러스터 이름"
  value       = aws_eks_cluster.main.name
}

output "cluster_endpoint" {
  description = "EKS API 서버 엔드포인트"
  value       = aws_eks_cluster.main.endpoint
}

output "cluster_certificate_authority_data" {
  description = "클러스터 CA 인증서 (base64 인코딩)"
  value       = aws_eks_cluster.main.certificate_authority[0].data
}

output "oidc_provider_arn" {
  description = "OIDC Provider ARN (IRSA에 사용)"
  value       = aws_iam_openid_connect_provider.cluster.arn
}

output "oidc_provider_url" {
  description = "OIDC Provider URL"
  value       = aws_iam_openid_connect_provider.cluster.url
}

output "node_group_role_arn" {
  description = "노드 그룹 IAM 역할 ARN"
  value       = aws_iam_role.node_group.arn
}
