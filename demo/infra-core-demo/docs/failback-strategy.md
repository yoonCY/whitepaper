# Failback 전략 — 레이어별 장애 대응 설계

## 개요

본 문서는 `infra-core-demo`의 각 레이어에서 발생 가능한 장애 시나리오와
그에 대한 자동화된 복구 전략을 기술합니다.

---

## 1. BFF 레이어 — Circuit Breaker

### 상태 전이도

```
요청 유입
    │
    ▼
┌───────────────────────────────────────────┐
│            Circuit Breaker                │
│                                           │
│  CLOSED ──(실패율 50% 초과)──▶ OPEN       │
│    ▲                             │        │
│    │                   (30초 후) │        │
│    └─────(탐침 성공)──  HALF-OPEN │        │
└───────────────────────────────────────────┘
    │
CLOSED: 정상 업스트림 호출
OPEN:   즉시 실패 → Fallback 실행
HALF-OPEN: 탐침 요청 1개 → 성공 시 CLOSED, 실패 시 OPEN
```

### Fallback 계층

| 계층 | 설명 | 조건 |
|------|------|------|
| **1차** | 실제 업스트림 API 호출 | CB 닫힘 상태 |
| **2차** | Redis 캐시 (마지막 성공 응답) | 1차 실패 + 캐시 존재 |
| **3차** | Static Fallback (기본값 응답) | 2차 실패 + staticFallback 설정 |
| **최종** | 503 Service Unavailable 반환 | 모든 Fallback 실패 |

### 설정 파라미터

```typescript
{
  errorThresholdPercentage: 50,  // 10초 창 내 50% 실패 → Open
  resetTimeout: 30_000,          // 30초 후 Half-Open
  timeout: 3_000,                // 3초 타임아웃
  volumeThreshold: 5,            // 최소 5개 요청 후 판단
  cacheTtlSeconds: 300,          // Redis 캐시 5분 유지
}
```

### 모니터링 알림 (Kibana → 알림 채널)

- `CB_OPEN`: Circuit Breaker 열림 → 즉시 알림 (P1)
- `FALLBACK_STATIC`: Static Fallback 사용 → 경고 (P2)
- `DLQ_MESSAGE`: DLQ 메시지 도착 → 경고 (P2)
- `DLQ_SEND_FAILURE_CRITICAL`: DLQ 전송 실패 → 즉시 알림 (P1)

---

## 2. Kafka 레이어 — DLQ 패턴

### 메시지 처리 흐름

```
Producer (idempotent)
    │
    ▼
app-events (RF=3, min.insync=2)
    │
    ▼
Consumer Group (수동 오프셋 커밋)
    │
    ├─ 성공 → 오프셋 커밋 (exactly-once)
    │
    └─ 실패 → 재시도 (지수 백오프, 최대 3회)
               │
               └─ 재시도 소진 → app-events-dlq
                                    │
                                    └─ 알림 발송 + 수동 처리
```

### Kafka 설정 (MSK)

| 설정 | 값 | 이유 |
|------|-----|------|
| `replication.factor` | 3 | 브로커 1개 장애 허용 |
| `min.insync.replicas` | 2 | 과반수 복제 확인 후 응답 |
| `enable.idempotence` | true | 중복 메시지 방지 |
| `acks` | all | 모든 ISR 확인 |

### 브로커 장애 시나리오

- **브로커 1개 장애**: 남은 2개 브로커로 Leader 재선출 → 자동 복구 (< 30초)
- **브로커 2개 장애**: `min.insync.replicas=2` 조건 미충족 → 쓰기 거부 (데이터 보호 우선)
- **MSK Multi-AZ**: AZ 장애 시 다른 AZ의 브로커가 자동으로 Leader 인수

---

## 3. EKS 레이어 — 고가용성 배포

### Pod 가용성 보장

| 메커니즘 | 설정 | 효과 |
|---------|------|------|
| **PodAntiAffinity** | `preferredDuringScheduling` | 다른 노드에 Pod 분산 |
| **PDB** | `minAvailable: 1` | 드레인 시 최소 1개 보장 |
| **HPA** | `maxReplicas: 10` | 부하 급증 시 자동 확장 |
| **Liveness Probe** | 20초 주기 | 데드락 Pod 자동 재시작 |
| **Readiness Probe** | 10초 주기 | 준비 안 된 Pod 트래픽 제외 |

### 노드 장애 시나리오

```
노드 A 장애 감지
    │
    ├─ kube-controller-manager: 미응답 노드 NotReady 처리
    │
    ├─ Pod 재스케줄링 (기본: 5분 대기)
    │   ├─ BFF Pod → 노드 B 또는 C로 이동
    │   └─ Consumer Pod → 노드 B 또는 C로 이동
    │
    └─ HPA: 트래픽 증가 감지 → 추가 Pod 생성
```

---

## 4. ELK 레이어 — 관측 가능성

### 장애 감지 파이프라인

```
App 에러 로그 발생
    │
Filebeat (< 1초) → Logstash (파싱) → Elasticsearch
                                           │
                                    Kibana Watcher
                                           │
                                    임계치 초과 시
                                    Slack/PagerDuty 알림
```

### Kibana 알림 규칙 (예시)

```json
{
  "trigger": {
    "schedule": { "interval": "1m" }
  },
  "input": {
    "search": {
      "request": {
        "indices": ["app-logs-*"],
        "body": {
          "query": {
            "bool": {
              "filter": [
                { "range": { "@timestamp": { "gte": "now-1m" } } },
                { "term": { "log_level": "error" } }
              ]
            }
          },
          "aggs": { "error_count": { "value_count": { "field": "_id" } } }
        }
      }
    }
  },
  "condition": {
    "compare": { "ctx.payload.aggregations.error_count.value": { "gt": 10 } }
  },
  "actions": {
    "notify_slack": {
      "webhook": {
        "url": "https://hooks.slack.com/services/...",
        "body": "1분 내 에러 {{ctx.payload.aggregations.error_count.value}}건 발생"
      }
    }
  }
}
```

---

## 5. 전체 RTO/RPO 목표

| 컴포넌트 | RTO | RPO | 달성 방법 |
|---------|-----|-----|---------|
| BFF | < 1초 | - | CB + Fallback |
| Kafka | < 30초 | 0 | Multi-AZ + min.insync.replicas |
| EKS Pod | < 2분 | - | PDB + HPA + Anti-Affinity |
| EKS Node | < 5분 | - | Multi-AZ + Cluster Autoscaler |
| OpenSearch | < 5분 | - | 레플리카 샤드 자동 재배치 |
| DB (RDS) | < 1분 | < 5분 | Multi-AZ + Read Replica |
| Region | < 5분 | < 5분 | Route53 Health Check + Failover |
