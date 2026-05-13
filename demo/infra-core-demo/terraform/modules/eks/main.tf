# Terraform — EKS 모듈 메인 리소스
# 패턴: OIDC 기반 IRSA + Managed Node Group + Spot 혼용
# Failback: Multi-AZ 노드 배치 + PodDisruptionBudget는 앱 레이어에서 관리

locals {
  cluster_name = "${var.project_name}-${var.environment}"
  common_tags = merge(
    var.tags,
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  )
}

# ──────────────────────────────────────────
# EKS 클러스터 보안 그룹
# Zero-Trust: 최소 권한 인바운드만 허용
# ──────────────────────────────────────────
resource "aws_security_group" "cluster" {
  name        = "${local.cluster_name}-cluster-sg"
  description = "EKS 클러스터 컨트롤 플레인 보안 그룹"
  vpc_id      = var.vpc_id

  # 노드 → 컨트롤 플레인 통신 (EKS 관리형으로 자동 처리되지만 명시적 정의)
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "모든 아웃바운드 허용 (EKS 표준)"
  }

  tags = merge(local.common_tags, {
    Name = "${local.cluster_name}-cluster-sg"
  })
}

# ──────────────────────────────────────────
# EKS 클러스터 IAM 역할
# ──────────────────────────────────────────
resource "aws_iam_role" "cluster" {
  name = "${local.cluster_name}-cluster-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "eks.amazonaws.com"
      }
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "cluster_AmazonEKSClusterPolicy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.cluster.name
}

# ──────────────────────────────────────────
# EKS 클러스터
# ──────────────────────────────────────────
resource "aws_eks_cluster" "main" {
  name     = local.cluster_name
  version  = var.cluster_version
  role_arn = aws_iam_role.cluster.arn

  vpc_config {
    subnet_ids              = var.private_subnet_ids
    security_group_ids      = [aws_security_group.cluster.id]
    endpoint_private_access = true  # 프라이빗 접근 활성화 (Zero-Trust)
    endpoint_public_access  = false # 퍼블릭 API 엔드포인트 비활성화
  }

  # 감사 로그 활성화 (Zero-Trust 요구사항)
  enabled_cluster_log_types = [
    "api",
    "audit",
    "authenticator",
    "controllerManager",
    "scheduler"
  ]

  encryption_config {
    provider {
      key_arn = aws_kms_key.eks.arn
    }
    resources = ["secrets"] # K8s Secrets 암호화
  }

  tags = local.common_tags

  depends_on = [
    aws_iam_role_policy_attachment.cluster_AmazonEKSClusterPolicy
  ]
}

# ──────────────────────────────────────────
# KMS 키 (K8s Secrets 암호화)
# ──────────────────────────────────────────
resource "aws_kms_key" "eks" {
  description             = "${local.cluster_name} EKS Secrets 암호화 키"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = local.common_tags
}

resource "aws_kms_alias" "eks" {
  name          = "alias/${local.cluster_name}-eks"
  target_key_id = aws_kms_key.eks.key_id
}

# ──────────────────────────────────────────
# OIDC Provider (IRSA — IAM Roles for Service Accounts)
# Zero-Trust: Pod별 최소 권한 IAM 역할 부여
# ──────────────────────────────────────────
data "tls_certificate" "cluster" {
  url = aws_eks_cluster.main.identity[0].oidc[0].issuer
}

resource "aws_iam_openid_connect_provider" "cluster" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.cluster.certificates[0].sha1_fingerprint]
  url             = aws_eks_cluster.main.identity[0].oidc[0].issuer

  tags = local.common_tags
}

# ──────────────────────────────────────────
# 노드 그룹 IAM 역할
# ──────────────────────────────────────────
resource "aws_iam_role" "node_group" {
  name = "${local.cluster_name}-node-group-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "node_AmazonEKSWorkerNodePolicy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
  role       = aws_iam_role.node_group.name
}

resource "aws_iam_role_policy_attachment" "node_AmazonEC2ContainerRegistryReadOnly" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  role       = aws_iam_role.node_group.name
}

resource "aws_iam_role_policy_attachment" "node_AmazonEKS_CNI_Policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
  role       = aws_iam_role.node_group.name
}

# ──────────────────────────────────────────
# 관리형 노드 그룹 (for_each로 다중 그룹 지원)
# Failback: Multi-AZ 배치로 단일 AZ 장애 격리
# ──────────────────────────────────────────
resource "aws_eks_node_group" "main" {
  for_each = var.node_groups

  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "${local.cluster_name}-${each.key}"
  node_role_arn   = aws_iam_role.node_group.arn
  subnet_ids      = var.private_subnet_ids

  instance_types = each.value.instance_types
  capacity_type  = each.value.capacity_type # ON_DEMAND 또는 SPOT
  disk_size      = each.value.disk_size

  scaling_config {
    min_size     = each.value.min_size
    max_size     = each.value.max_size
    desired_size = each.value.desired_size
  }

  # 노드 교체 시 최소 가용성 보장
  update_config {
    max_unavailable_percentage = 25 # 최대 25% 노드만 동시 교체
  }

  labels = each.value.labels

  dynamic "taint" {
    for_each = each.value.taints
    content {
      key    = taint.value.key
      value  = taint.value.value
      effect = taint.value.effect
    }
  }

  tags = merge(local.common_tags, {
    Name = "${local.cluster_name}-${each.key}-node"
    # Cluster Autoscaler가 이 노드 그룹을 자동 스케일링하도록 태그
    "k8s.io/cluster-autoscaler/enabled"              = "true"
    "k8s.io/cluster-autoscaler/${local.cluster_name}" = "owned"
  })

  depends_on = [
    aws_iam_role_policy_attachment.node_AmazonEKSWorkerNodePolicy,
    aws_iam_role_policy_attachment.node_AmazonEC2ContainerRegistryReadOnly,
    aws_iam_role_policy_attachment.node_AmazonEKS_CNI_Policy,
  ]

  lifecycle {
    # desired_size 외부 변경(오토스케일링) 무시
    ignore_changes = [scaling_config[0].desired_size]
  }
}

# ──────────────────────────────────────────
# EKS 클러스터 애드온
# ──────────────────────────────────────────
resource "aws_eks_addon" "main" {
  for_each = var.cluster_addons

  cluster_name             = aws_eks_cluster.main.name
  addon_name               = each.key
  addon_version            = each.value
  resolve_conflicts_on_update = "OVERWRITE"

  tags = local.common_tags
}
