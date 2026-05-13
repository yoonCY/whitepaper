# infra-core-demo 통합 Makefile
# 사용: make <target>

.PHONY: help elk-up elk-down elk-logs tf-init tf-plan tf-apply bff-dev k8s-apply k8s-delete validate lint

# 기본: 도움말 출력
.DEFAULT_GOAL := help

TERRAFORM_DIR   := terraform/environments/dev
K8S_OVERLAY     := k8s/overlays/dev
BFF_DIR         := bff
KAFKA_DIR       := kafka
ELK_DIR         := elk
ANSIBLE_DIR     := ansible

GREEN  := \033[0;32m
YELLOW := \033[0;33m
NC     := \033[0m

help: ## 사용 가능한 명령 목록 출력
	@echo ""
	@echo "  ╔═══════════════════════════════════════╗"
	@echo "  ║     infra-core-demo 명령 목록         ║"
	@echo "  ╚═══════════════════════════════════════╝"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""

# ──────────────────────────────────────────
# ELK 스택 (로컬)
# ──────────────────────────────────────────
elk-up: ## ELK 스택 시작 (Elasticsearch + Logstash + Kibana + Filebeat + Kafka)
	@echo "$(YELLOW)ELK 스택 시작 중...$(NC)"
	cd $(ELK_DIR) && docker compose up -d
	@echo "$(GREEN)ELK 스택 시작 완료$(NC)"
	@echo "  Kibana:        http://localhost:5601"
	@echo "  Elasticsearch: http://localhost:9200"
	@echo "  Kafka:         localhost:29092"

elk-down: ## ELK 스택 종료
	cd $(ELK_DIR) && docker compose down

elk-logs: ## ELK 스택 로그 실시간 확인
	cd $(ELK_DIR) && docker compose logs -f --tail=100

elk-status: ## ELK 스택 상태 확인
	@echo "── Elasticsearch 클러스터 상태 ──"
	@curl -s -u elastic:changeme http://localhost:9200/_cluster/health?pretty 2>/dev/null || echo "Elasticsearch 미실행"
	@echo "\n── Kafka 토픽 목록 ──"
	@docker exec elk-kafka kafka-topics --bootstrap-server localhost:9092 --list 2>/dev/null || echo "Kafka 미실행"

# ──────────────────────────────────────────
# BFF 서비스
# ──────────────────────────────────────────
bff-install: ## BFF 의존성 설치
	cd $(BFF_DIR) && npm install

bff-dev: ## BFF 개발 서버 실행
	@echo "$(YELLOW)BFF 서버 시작 중 (포트: 3000)$(NC)"
	cd $(BFF_DIR) && npm run dev

bff-build: ## BFF Docker 이미지 빌드
	@echo "$(YELLOW)BFF Docker 이미지 빌드 중...$(NC)"
	docker build -t infra-core/bff:latest $(BFF_DIR)/
	@echo "$(GREEN)빌드 완료: infra-core/bff:latest$(NC)"

bff-test: ## BFF Circuit Breaker API 테스트
	@echo "── BFF 헬스체크 ──"
	@curl -s http://localhost:3000/healthz/live | jq . || echo "BFF 미실행"
	@echo "\n── Circuit Breaker 상태 ──"
	@curl -s http://localhost:3000/healthz/circuit-breakers | jq . || echo "BFF 미실행"

# ──────────────────────────────────────────
# Kafka SDK
# ──────────────────────────────────────────
kafka-install: ## Kafka SDK 의존성 설치
	cd $(KAFKA_DIR) && npm install

kafka-producer-demo: ## Kafka 프로듀서 데모 실행
	@echo "$(YELLOW)Kafka 프로듀서 데모 실행 중...$(NC)"
	cd $(KAFKA_DIR) && npm run producer:demo

kafka-consumer-demo: ## Kafka DLQ 컨슈머 데모 실행
	@echo "$(YELLOW)Kafka DLQ 컨슈머 실행 중...$(NC)"
	cd $(KAFKA_DIR) && npm run consumer:demo

# ──────────────────────────────────────────
# Terraform (AWS)
# ──────────────────────────────────────────
tf-init: ## Terraform 초기화 (Dev 환경)
	@echo "$(YELLOW)Terraform 초기화 중 (dev)...$(NC)"
	cd $(TERRAFORM_DIR) && terraform init

tf-validate: ## Terraform 설정 검증
	cd $(TERRAFORM_DIR) && terraform validate
	@echo "$(GREEN)Terraform 검증 통과$(NC)"

tf-plan: ## Terraform Plan (변경사항 미리보기)
	@echo "$(YELLOW)Terraform Plan 실행 중...$(NC)"
	cd $(TERRAFORM_DIR) && terraform plan -var-file="dev.tfvars"

tf-apply: ## Terraform Apply (실제 AWS 리소스 생성 — 비용 발생)
	@echo "$(YELLOW)[경고] 실제 AWS 리소스가 생성됩니다. 비용이 발생할 수 있습니다.$(NC)"
	@read -p "계속하시겠습니까? (yes/no): " confirm && [ "$$confirm" = "yes" ] || exit 1
	cd $(TERRAFORM_DIR) && terraform apply -var-file="dev.tfvars" -auto-approve

tf-destroy: ## Terraform Destroy (AWS 리소스 삭제)
	@echo "$(YELLOW)[경고] 모든 AWS 리소스가 삭제됩니다!$(NC)"
	@read -p "계속하시겠습니까? (yes/no): " confirm && [ "$$confirm" = "yes" ] || exit 1
	cd $(TERRAFORM_DIR) && terraform destroy -var-file="dev.tfvars" -auto-approve

# ──────────────────────────────────────────
# Kubernetes
# ──────────────────────────────────────────
k8s-validate: ## K8s 매니페스트 유효성 검증 (dry-run)
	@echo "$(YELLOW)K8s 매니페스트 검증 중...$(NC)"
	kubectl apply -k $(K8S_OVERLAY) --dry-run=client
	@echo "$(GREEN)K8s 매니페스트 검증 통과$(NC)"

k8s-apply: ## K8s 매니페스트 적용 (EKS 클러스터 필요)
	@echo "$(YELLOW)K8s 매니페스트 적용 중...$(NC)"
	kubectl apply -k $(K8S_OVERLAY)
	kubectl rollout status deployment/bff -n infra-core

k8s-delete: ## K8s 워크로드 삭제
	kubectl delete -k $(K8S_OVERLAY)

k8s-status: ## K8s 워크로드 상태 확인
	@echo "── Pods ──"
	@kubectl get pods -n infra-core -o wide 2>/dev/null || echo "K8s 클러스터 미연결"
	@echo "\n── Circuit Breaker 상태 ──"
	@kubectl exec -n infra-core deploy/bff -- wget -qO- http://localhost:3000/healthz/circuit-breakers 2>/dev/null | jq . || true

# ──────────────────────────────────────────
# Ansible
# ──────────────────────────────────────────
ansible-ping: ## Ansible 인벤토리 연결 테스트
	cd $(ANSIBLE_DIR) && ansible -i inventory/aws_ec2.yml all -m ping

ansible-site: ## Ansible 전체 플레이북 실행 (--check 드라이런)
	cd $(ANSIBLE_DIR) && ansible-playbook -i inventory/aws_ec2.yml playbooks/site.yml --check --diff

ansible-lint: ## Ansible Lint 실행
	cd $(ANSIBLE_DIR) && ansible-lint playbooks/

# ──────────────────────────────────────────
# 전체 검증 (CI/CD)
# ──────────────────────────────────────────
validate: tf-validate k8s-validate ## 모든 설정 파일 유효성 검증
	@echo "$(GREEN)모든 검증 통과$(NC)"

install-all: bff-install kafka-install ## 모든 의존성 설치

demo-local: elk-up ## 로컬 데모 전체 시작 (ELK + BFF + Kafka)
	@sleep 10
	@$(MAKE) bff-dev &
	@$(MAKE) kafka-consumer-demo &
	@echo "$(GREEN)로컬 데모 시작 완료$(NC)"
	@echo "  Kibana:   http://localhost:5601"
	@echo "  BFF API:  http://localhost:3000"
	@echo "  Kafka:    localhost:29092"
