# 운영 런북 (Runbook)

> **사용 목적**: 장애 발생 시 빠른 진단과 복구를 위한 표준 절차서

---

## 긴급 연락처

| 역할 | 담당 | 연락처 |
|------|------|--------|
| On-Call 플랫폼 엔지니어 | 로테이션 | PagerDuty 에스컬레이션 정책 |
| AWS Support | Enterprise | 콘솔 → Support 케이스 |

---

## 1. EKS 관련

### 1.1 Pod CrashLoopBackOff

```bash
# 1. Pod 상태 확인
kubectl get pods -n infra-core
kubectl describe pod <pod-name> -n infra-core

# 2. 최근 로그 확인
kubectl logs <pod-name> -n infra-core --previous --tail=100

# 3. 이벤트 확인
kubectl get events -n infra-core --sort-by='.lastTimestamp' | tail -20

# 4. Pod 강제 재시작 (임시 조치)
kubectl rollout restart deployment/bff -n infra-core

# 5. 이전 버전으로 롤백
kubectl rollout undo deployment/bff -n infra-core
kubectl rollout status deployment/bff -n infra-core
```

### 1.2 노드 NotReady

```bash
# 1. 노드 상태 확인
kubectl get nodes -o wide
kubectl describe node <node-name>

# 2. 노드 드레인 (수동 드레인 필요 시)
kubectl drain <node-name> --ignore-daemonsets --delete-emptydir-data

# 3. EC2 인스턴스 상태 확인 (AWS CLI)
aws ec2 describe-instance-status --instance-ids <instance-id> --region ap-northeast-2

# 4. SSM으로 노드 접속 (Bastion 없이)
aws ssm start-session --target <instance-id>
```

---

## 2. Kafka (MSK) 관련

### 2.1 Consumer Lag 급증

```bash
# Consumer Lag 확인 (MSK Connect 또는 카프카 CLI)
# Bastion을 통해 접속 후 실행

# Kafka Consumer 그룹 상태 확인
kafka-consumer-groups.sh \
  --bootstrap-server <bootstrap-brokers> \
  --group infra-core-workers \
  --describe

# Lag이 100 이상이면 Consumer 레플리카 수동 확장
kubectl scale deployment/kafka-consumer --replicas=6 -n infra-core

# KEDA 사용 시: ScaledObject 상태 확인
kubectl describe scaledobject kafka-consumer-scaler -n infra-core
```

### 2.2 DLQ 메시지 처리

```bash
# DLQ 메시지 수 확인
kafka-consumer-groups.sh \
  --bootstrap-server <bootstrap-brokers> \
  --group dlq-inspector \
  --describe --topic app-events-dlq

# DLQ 메시지 내용 확인 (최신 10개)
kafka-console-consumer.sh \
  --bootstrap-server <bootstrap-brokers> \
  --topic app-events-dlq \
  --from-beginning \
  --max-messages 10 \
  --formatter kafka.tools.DefaultMessageFormatter \
  --property print.key=true

# DLQ 메시지 재처리 (원본 토픽으로 이동)
# 별도 재처리 스크립트 실행 필요 (scripts/dlq-replay.sh)
```

---

## 3. ELK 관련

### 3.1 Elasticsearch 클러스터 Red 상태

```bash
# 클러스터 상태 확인
curl -u elastic:$ELASTIC_PASSWORD http://localhost:9200/_cluster/health?pretty

# 샤드 상태 확인
curl -u elastic:$ELASTIC_PASSWORD http://localhost:9200/_cat/shards?v&health=red

# 미할당 샤드 강제 재할당
curl -u elastic:$ELASTIC_PASSWORD -X POST http://localhost:9200/_cluster/reroute?retry_failed=true

# 인덱스 상태 확인
curl -u elastic:$ELASTIC_PASSWORD http://localhost:9200/_cat/indices?v&health=red
```

### 3.2 Kibana 접속 불가

```bash
# Kibana 컨테이너 상태 확인
kubectl get pod -n elk -l app=kibana
kubectl logs -n elk -l app=kibana --tail=50

# Kibana 재시작
kubectl rollout restart deployment/kibana -n elk

# Elasticsearch 연결 확인
kubectl exec -n elk -it <kibana-pod> -- curl http://elasticsearch:9200/_cluster/health
```

---

## 4. BFF Circuit Breaker 관련

### 4.1 CB 상태 수동 확인

```bash
# CB 상태 API 조회
curl https://api.example.com/healthz/circuit-breakers | jq .

# 예시 응답:
# {
#   "user-service": { "state": "open", "failureCount": 15 },
#   "order-service": { "state": "closed", "failureCount": 1 }
# }
```

### 4.2 업스트림 서비스 장애 시 BFF 대응

```bash
# 1. 업스트림 서비스 상태 확인
kubectl get pods -n infra-core -l app=user-service

# 2. 업스트림 서비스 재시작
kubectl rollout restart deployment/user-service -n infra-core

# 3. CB가 자동으로 Half-Open → Closed로 전환 대기 (30초)
# 4. /healthz/circuit-breakers로 복구 확인
```

---

## 5. Terraform 관련

### 5.1 State Lock 해제

```bash
# S3 + DynamoDB로 State가 잠긴 경우 (비정상 종료)

# Lock 정보 확인
aws dynamodb get-item \
  --table-name infra-core-tflock-dev \
  --key '{"LockID": {"S": "infra-core-tfstate-dev/dev/terraform.tfstate-md5"}}' \
  --region ap-northeast-2

# Lock 강제 해제 (위험: 동시 실행 확인 후 진행)
terraform force-unlock <LOCK_ID>
```

---

## 6. 공통 확인 명령

```bash
# AWS 리소스 전체 태그 확인
aws resourcegroupstaggingapi get-resources \
  --tag-filters Key=Project,Values=infra-core \
  --region ap-northeast-2 \
  --query 'ResourceTagMappingList[].ResourceARN' \
  --output table

# EKS kubeconfig 업데이트
aws eks update-kubeconfig \
  --name infra-core-dev \
  --region ap-northeast-2

# 모든 Pod 상태 한눈에 보기
kubectl get pods -n infra-core -o wide --sort-by='.status.phase'

# 최근 이벤트 (이상 상황 파악)
kubectl get events -n infra-core \
  --sort-by='.lastTimestamp' \
  --field-selector type=Warning \
  | tail -20
```
