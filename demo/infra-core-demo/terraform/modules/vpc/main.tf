# Terraform — VPC 모듈 메인 리소스
# 패턴: Multi-AZ 고가용성 네트워크 구성
# Failback: 각 AZ에 독립 서브넷/NAT GW → 단일 AZ 장애 시 트래픽 자동 우회

locals {
  # 공통 태그 병합 (프로젝트, 환경 정보 포함)
  common_tags = merge(
    var.tags,
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  )

  # NAT GW 수: single_nat_gateway=true면 1개, 아니면 AZ 수만큼
  nat_gateway_count = var.single_nat_gateway ? 1 : length(var.azs)
}

# ──────────────────────────────────────────
# VPC
# ──────────────────────────────────────────
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true # EKS 노드 DNS 해석에 필수
  enable_dns_support   = true

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-vpc"
    # EKS가 이 VPC를 클러스터 VPC로 인식하기 위한 태그
    "kubernetes.io/cluster/${var.project_name}-${var.environment}" = "shared"
  })
}

# ──────────────────────────────────────────
# 인터넷 게이트웨이 (퍼블릭 서브넷 아웃바운드)
# ──────────────────────────────────────────
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-igw"
  })
}

# ──────────────────────────────────────────
# 퍼블릭 서브넷 (ALB, Bastion, NAT GW 위치)
# ──────────────────────────────────────────
resource "aws_subnet" "public" {
  count = length(var.public_subnet_cidrs)

  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = var.azs[count.index]
  map_public_ip_on_launch = true # Bastion 등 퍼블릭 IP 자동 할당

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-public-${var.azs[count.index]}"
    # EKS ALB Ingress Controller가 이 서브넷에 ALB를 배치하도록 태그
    "kubernetes.io/role/elb" = "1"
    "kubernetes.io/cluster/${var.project_name}-${var.environment}" = "shared"
  })
}

# ──────────────────────────────────────────
# 프라이빗 서브넷 (EKS 노드, MSK, RDS 위치)
# ──────────────────────────────────────────
resource "aws_subnet" "private" {
  count = length(var.private_subnet_cidrs)

  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = var.azs[count.index]

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-private-${var.azs[count.index]}"
    # EKS internal ALB (서비스 내부 통신)를 이 서브넷에 배치
    "kubernetes.io/role/internal-elb" = "1"
    "kubernetes.io/cluster/${var.project_name}-${var.environment}" = "shared"
  })
}

# ──────────────────────────────────────────
# Elastic IP (NAT GW 고정 IP)
# ──────────────────────────────────────────
resource "aws_eip" "nat" {
  count  = var.enable_nat_gateway ? local.nat_gateway_count : 0
  domain = "vpc"

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-nat-eip-${count.index + 1}"
  })

  depends_on = [aws_internet_gateway.main]
}

# ──────────────────────────────────────────
# NAT 게이트웨이 (프라이빗 → 인터넷 아웃바운드)
# Failback 포인트: single_nat_gateway=false 시 AZ별 독립 NAT GW
#   → 단일 AZ NAT GW 장애 시 해당 AZ의 다른 서비스만 영향
# ──────────────────────────────────────────
resource "aws_nat_gateway" "main" {
  count = var.enable_nat_gateway ? local.nat_gateway_count : 0

  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-nat-${count.index + 1}"
  })

  depends_on = [aws_internet_gateway.main]
}

# ──────────────────────────────────────────
# 라우팅 테이블 — 퍼블릭 (IGW → 인터넷)
# ──────────────────────────────────────────
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-public-rt"
  })
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# ──────────────────────────────────────────
# 라우팅 테이블 — 프라이빗 (NAT GW → 인터넷)
# single_nat_gateway=false: AZ별 독립 라우팅 테이블
# ──────────────────────────────────────────
resource "aws_route_table" "private" {
  count  = length(var.private_subnet_cidrs)
  vpc_id = aws_vpc.main.id

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-private-rt-${count.index + 1}"
  })
}

resource "aws_route" "private_nat" {
  count = var.enable_nat_gateway ? length(var.private_subnet_cidrs) : 0

  route_table_id         = aws_route_table.private[count.index].id
  destination_cidr_block = "0.0.0.0/0"
  # single_nat_gateway면 항상 0번 NAT, 아니면 AZ별 NAT
  nat_gateway_id = var.single_nat_gateway ? aws_nat_gateway.main[0].id : aws_nat_gateway.main[count.index].id
}

resource "aws_route_table_association" "private" {
  count          = length(aws_subnet.private)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# ──────────────────────────────────────────
# VPC Flow Log (보안 감사, Zero-Trust 준수)
# ──────────────────────────────────────────
resource "aws_flow_log" "main" {
  vpc_id          = aws_vpc.main.id
  traffic_type    = "ALL"
  iam_role_arn    = aws_iam_role.flow_log.arn
  log_destination = aws_cloudwatch_log_group.flow_log.arn

  tags = merge(local.common_tags, {
    Name = "${var.project_name}-${var.environment}-flow-log"
  })
}

resource "aws_cloudwatch_log_group" "flow_log" {
  name              = "/aws/vpc-flow-log/${var.project_name}-${var.environment}"
  retention_in_days = 30 # 30일 보관 (규정 준수 최소 요건)

  tags = local.common_tags
}

resource "aws_iam_role" "flow_log" {
  name = "${var.project_name}-${var.environment}-vpc-flow-log-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "vpc-flow-logs.amazonaws.com"
      }
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "flow_log" {
  name = "vpc-flow-log-policy"
  role = aws_iam_role.flow_log.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogGroups",
        "logs:DescribeLogStreams"
      ]
      Resource = "*"
    }]
  })
}
