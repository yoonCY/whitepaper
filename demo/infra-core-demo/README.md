# infra-core-demo

> **"10년차 플랫폼 엔지니어의 실운영 인프라 코어 아키텍처 데모"**  
> AWS 기반 프로덕션 수준의 모듈화된 인프라 패턴을 공통 틀로 시연합니다.

---

## ⚡ CORE 철학

이 데모는 **완전한 서비스 구현**이 아닌, **확장 가능한 공통 코어 로직**에 집중합니다.

| 원칙 | 설명 |
|------|------|
| **Modularity First** | 각 레이어는 독립 배포 가능한 모듈 단위로 설계 |
| **Failback by Design** | 모든 컴포넌트는 장애 시나리오와 복구 전략을 내포 |
| **Observable Everything** | 구조화 로그 → ELK → Kibana 대시보드까지 완전한 가시성 |
| **Zero-Trust** | 서비스 간 통신은 기본 불신. mTLS + RBAC 기반 |
| **IaC 100%** | 인프라는 모두 코드로 관리. 콘솔 수동 작업 불허 |

---

## 🏗️ 전체 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│                    AWS Cloud (ap-northeast-2)            │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │                   VPC (10.0.0.0/16)              │   │
│  │                                                 │   │
│  │  Public Subnets          Private Subnets         │   │
│  │  ┌─────────────┐        ┌──────────────────┐   │   │
│  │  │ ALB         │        │  EKS Node Groups │   │   │
│  │  │ Bastion     │        │  ┌─────────────┐ │   │   │
│  │  │ NAT GW      │        │  │ BFF Service │ │   │   │
│  │  └─────────────┘        │  │ Backend Svc │ │   │   │
│  │          │              │  │ Kafka Worker│ │   │   │
│  │          └──────────────┤  └─────────────┘ │   │   │
│  │                         └──────────────────┘   │   │
│  │                                                 │   │
│  │  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │   │
│  │  │   MSK    │  │OpenSearch│  │     ECR     │  │   │
│  │  │  Kafka   │  │  (ELK)   │  │  Registry   │  │   │
│  │  └──────────┘  └──────────┘  └─────────────┘  │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘

         IaC          Config Mgmt      Orchestration
      Terraform    →   Ansible      →   Kubernetes
```

---

## 📦 모듈 구성

```
infra-core-demo/
├── terraform/          # AWS 인프라 IaC (모듈화)
│   ├── modules/
│   │   ├── vpc/        # 네트워크 기반
│   │   ├── eks/        # Kubernetes 클러스터
│   │   ├── msk/        # Managed Kafka
│   │   ├── opensearch/ # ELK 매니지드 서비스
│   │   └── ecr/        # 컨테이너 레지스트리
│   └── environments/
│       ├── dev/
│       └── prod/
│
├── ansible/            # 구성 관리 (역할 기반)
│   ├── roles/
│   │   ├── common/     # OS 공통 설정
│   │   ├── bastion/    # 배스천 설정
│   │   └── k8s-node/   # K8s 노드 부트스트랩
│   └── playbooks/
│
├── k8s/                # Kubernetes 매니페스트 (Kustomize)
│   ├── base/           # 공통 기반 리소스
│   ├── apps/           # 워크로드 정의
│   └── overlays/       # 환경별 오버레이
│
├── kafka/              # Kafka 공통 SDK
│   ├── producer/       # 멱등 프로듀서
│   └── consumer/       # Consumer Group + DLQ
│
├── bff/                # BFF 서비스 (Circuit Breaker 핵심)
│   └── src/
│       ├── gateway/
│       ├── aggregator/
│       └── circuit-breaker/
│
├── elk/                # ELK 로컬 스택 (Docker Compose)
│   ├── logstash/
│   ├── kibana/
│   └── filebeat/
│
└── docs/               # 설계 문서
    ├── architecture.md
    ├── failback-strategy.md
    └── runbook.md
```

---

## 🔑 CORE 로직 — 핵심 구현 포인트

### 1. Terraform 모듈화 패턴
- **Remote State**: S3 + DynamoDB Lock으로 팀 협업 상태 관리
- **Workspace 분리**: `dev` / `prod` 환경을 동일 코드로 관리
- **Module Output 체이닝**: VPC → EKS → MSK 순 의존성 체인

### 2. BFF Circuit Breaker (Failback 핵심)
- **상태 머신**: Closed → Open → Half-Open → Closed
- **Fallback 강등**: `Primary API → Redis Cache → Static Response`
- **업스트림별 독립 CB**: 서비스 장애가 BFF 전체로 전파 차단

### 3. Kafka DLQ 패턴 (메시지 유실 방지)
- **멱등 프로듀서**: `enable.idempotence=true` + `acks=all`
- **재시도 큐**: `retry-topic` (3회) → `dlq-topic` (알림)
- **Consumer Group Lag 모니터링**: Prometheus + Grafana 연동 가능

### 4. ELK 구조화 로그 파이프라인
- **Filebeat DaemonSet**: 모든 Pod 로그 자동 수집
- **Logstash Grok**: JSON 로그 파싱 + 필드 정규화
- **Kibana 사전 대시보드**: Error Rate, CB 상태, Kafka Lag

### 5. Ansible 동적 인벤토리
- **AWS EC2 태그 기반**: `Environment=prod, Role=k8s-node` 태그로 자동 그룹화
- **Vault 암호화**: 시크릿은 `ansible-vault`로 암호화 관리
- **Idempotent Playbook**: 재실행 안전 (멱등성 보장)

---

## 🚀 빠른 시작

### 로컬 ELK 스택 실행
```bash
cd elk/
docker compose up -d
# Kibana: http://localhost:5601
# Elasticsearch: http://localhost:9200
```

### Terraform 초기화 (Dev 환경)
```bash
cd terraform/environments/dev/
terraform init
terraform workspace select dev
terraform plan -var-file="dev.tfvars"
```

### BFF 서비스 실행
```bash
cd bff/
npm install
npm run dev
# BFF: http://localhost:3000
```

### Kafka 프로듀서/컨슈머 테스트
```bash
cd kafka/
npm install
# 프로듀서 테스트
npm run producer:demo
# 컨슈머 실행
npm run consumer:demo
```

---

## 🛡️ Failback 전략 요약

| 레이어 | 장애 시나리오 | 대응 전략 | RTO |
|--------|-------------|----------|-----|
| **BFF** | 업스트림 타임아웃 | Circuit Breaker → Cache | < 1s |
| **Kafka** | 브로커 일부 장애 | MSK Multi-AZ 자동 페일오버 | < 30s |
| **EKS Node** | 노드 OOM/종료 | PDB + HPA 자동 스케일 | < 2m |
| **OpenSearch** | 샤드 이동 | 레플리카 자동 재배치 | < 5m |
| **Region** | AZ 전체 장애 | Route53 Failover Record | < 5m |

> 자세한 내용은 [`docs/failback-strategy.md`](./docs/failback-strategy.md)를 참조하세요.

---

## 📊 모니터링 구성

```
App Logs (JSON) → Filebeat → Logstash → Elasticsearch
                                              │
                                          Kibana
                                    ┌─────────────┐
                                    │ Dashboard   │
                                    │ - Error Rate│
                                    │ - CB Status │
                                    │ - Latency   │
                                    │ - Kafka Lag │
                                    └─────────────┘
```

---

## 🔧 기술 스택

| 레이어 | 기술 |
|--------|------|
| IaC | Terraform 1.7+, AWS Provider 5.x |
| Config Mgmt | Ansible 2.16+, ansible-lint |
| Container | Docker, Kubernetes 1.29+, Kustomize |
| Messaging | Apache Kafka (AWS MSK), Avro Schema |
| Observability | ELK Stack (Elasticsearch 8.x, Logstash, Kibana, Filebeat) |
| BFF | Node.js 20+, TypeScript, opossum (Circuit Breaker) |
| Registry | AWS ECR |
| CI/CD | GitHub Actions |

---

*© 2026 — 10년차 플랫폼 엔지니어 포트폴리오. 실제 운영 환경에서 검증된 패턴을 기반으로 합니다.*
