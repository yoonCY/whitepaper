output "cluster_arn" {
  description = "MSK 클러스터 ARN"
  value       = aws_msk_cluster.main.arn
}

output "bootstrap_brokers_tls" {
  description = "TLS 부트스트랩 브로커 엔드포인트 (애플리케이션 연결용)"
  value       = aws_msk_cluster.main.bootstrap_brokers_tls
  sensitive   = true
}

output "bootstrap_brokers_sasl_scram" {
  description = "SASL/SCRAM 부트스트랩 브로커 엔드포인트"
  value       = aws_msk_cluster.main.bootstrap_brokers_sasl_scram
  sensitive   = true
}

output "zookeeper_connect_string" {
  description = "Zookeeper 연결 문자열 (토픽 관리용)"
  value       = aws_msk_cluster.main.zookeeper_connect_string
  sensitive   = true
}

output "msk_security_group_id" {
  description = "MSK 보안 그룹 ID (EKS 노드에서 접근 허용 시 참조)"
  value       = aws_security_group.msk.id
}

output "credentials_secret_arn" {
  description = "SASL/SCRAM 자격증명 Secret ARN"
  value       = aws_secretsmanager_secret.msk_credentials.arn
}
