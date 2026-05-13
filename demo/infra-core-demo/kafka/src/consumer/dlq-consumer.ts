/**
 * DLQ(Dead Letter Queue) 패턴 컨슈머
 *
 * 메시지 처리 실패 시 흐름:
 *   원본 토픽 → 처리 실패 → Retry 토픽 (3회) → DLQ 토픽 → 알림
 *
 * 핵심 특징:
 * - 수동 오프셋 커밋: 처리 완료 후 커밋 → 메시지 유실 방지
 * - 재시도 로직: 지수 백오프 + 최대 재시도 횟수
 * - DLQ 전송: 최종 실패 메시지를 DLQ에 저장 + 구조화 로그
 * - Graceful Shutdown: SIGTERM 수신 시 현재 처리 완료 후 종료
 */

import { Kafka, Consumer, EachMessagePayload, KafkaMessage } from 'kafkajs';
import { KafkaConfig, ConsumerConfig, BaseEvent, DlqMessage } from '../types';
import { IdempotentProducer } from '../producer/idempotent-producer';
import { createLogger } from '../logger';

const logger = createLogger('DlqConsumer');

/** 메시지 처리 핸들러 타입 */
type MessageHandler<T = unknown> = (event: BaseEvent<T>, rawMessage: KafkaMessage) => Promise<void>;

export class DlqConsumer<T = unknown> {
  private kafka: Kafka;
  private consumer: Consumer;
  private dlqProducer: IdempotentProducer;
  private config: ConsumerConfig;
  private handler: MessageHandler<T>;
  private isRunning = false;

  /** 메시지별 재시도 횟수 추적 (messageKey → {count, firstFailedAt}) */
  private retryMap = new Map<string, { count: number; firstFailedAt: string }>();

  constructor(
    kafkaConfig: KafkaConfig,
    consumerConfig: ConsumerConfig,
    handler: MessageHandler<T>
  ) {
    this.config = consumerConfig;
    this.handler = handler;

    this.kafka = new Kafka({
      clientId: kafkaConfig.clientId,
      brokers: kafkaConfig.brokers,
      ssl: kafkaConfig.ssl,
      sasl: kafkaConfig.sasl as any,
      retry: {
        retries: 10,
        initialRetryTime: 300,
        multiplier: 2,
      },
    });

    this.consumer = this.kafka.consumer({
      groupId: consumerConfig.groupId,
      sessionTimeout: consumerConfig.sessionTimeout ?? 30_000,
      heartbeatInterval: 3_000,
      // 자동 커밋 비활성화 (수동 커밋으로 메시지 유실 방지)
      allowAutoTopicCreation: false,
    });

    // DLQ 전송용 프로듀서
    const dlqTopic = consumerConfig.dlq?.topic ?? `${consumerConfig.topics[0]}-dlq`;
    this.dlqProducer = new IdempotentProducer(kafkaConfig, {
      topic: dlqTopic,
      idempotent: true,
    });
  }

  /**
   * 컨슈머 시작
   * 연결 → 구독 → 메시지 처리 루프
   */
  async start(): Promise<void> {
    await this.consumer.connect();
    await this.dlqProducer.connect();

    // 원본 토픽 + Retry 토픽 구독
    await this.consumer.subscribe({
      topics: this.config.topics,
      fromBeginning: false, // 신규 메시지부터 처리
    });

    this.isRunning = true;

    logger.info({
      message: 'Consumer 시작',
      groupId: this.config.groupId,
      topics: this.config.topics,
    });

    await this.consumer.run({
      // 자동 커밋 비활성화 (처리 완료 후 수동 커밋)
      autoCommit: false,
      // 파티션당 동시 처리 수 제한
      partitionsConsumedConcurrently: this.config.concurrency ?? 1,

      eachMessage: async (payload: EachMessagePayload) => {
        await this.processMessage(payload);
      },
    });
  }

  /**
   * 개별 메시지 처리 + 재시도 + DLQ
   */
  private async processMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, partition, message } = payload;
    const messageKey = `${topic}-${partition}-${message.offset}`;
    const maxRetries = this.config.dlq?.maxRetries ?? 3;
    const retryDelay = this.config.dlq?.retryDelay ?? 1_000;

    // 메시지 역직렬화
    let event: BaseEvent<T>;
    try {
      event = JSON.parse(message.value?.toString() ?? '{}') as BaseEvent<T>;
    } catch (parseError) {
      logger.error({
        message: '메시지 역직렬화 실패',
        topic,
        partition,
        offset: message.offset,
        error: String(parseError),
      });
      // 파싱 불가 메시지는 즉시 DLQ로 (재시도 불필요)
      await this.sendToDlq(message, topic, '메시지 파싱 오류', maxRetries);
      await this.consumer.commitOffsets([
        { topic, partition, offset: String(Number(message.offset) + 1) }
      ]);
      return;
    }

    // 재시도 상태 조회
    const retryState = this.retryMap.get(messageKey) ?? {
      count: 0,
      firstFailedAt: new Date().toISOString(),
    };

    try {
      // 핸들러 실행
      await this.handler(event, message);

      // 성공: 오프셋 커밋 + 재시도 맵 정리
      await this.consumer.commitOffsets([
        { topic, partition, offset: String(Number(message.offset) + 1) }
      ]);
      this.retryMap.delete(messageKey);

      logger.info({
        message: '메시지 처리 성공',
        eventId: event.id,
        eventType: event.type,
        topic,
        partition,
        offset: message.offset,
        traceId: event.traceId,
      });
    } catch (handlerError) {
      const currentRetry = retryState.count + 1;
      this.retryMap.set(messageKey, {
        count: currentRetry,
        firstFailedAt: retryState.firstFailedAt,
      });

      logger.warn({
        message: `메시지 처리 실패 (${currentRetry}/${maxRetries}회 시도)`,
        eventId: event.id,
        eventType: event.type,
        topic,
        partition,
        offset: message.offset,
        error: String(handlerError),
        traceId: event.traceId,
      });

      if (currentRetry >= maxRetries) {
        // 최대 재시도 초과 → DLQ로 이동
        await this.sendToDlq(
          message,
          topic,
          String(handlerError),
          currentRetry,
          retryState.firstFailedAt
        );
        this.retryMap.delete(messageKey);

        // DLQ 전송 후 오프셋 커밋 (메시지를 '처리됨'으로 표시)
        await this.consumer.commitOffsets([
          { topic, partition, offset: String(Number(message.offset) + 1) }
        ]);
      } else {
        // 재시도: 지수 백오프 대기
        const backoff = retryDelay * Math.pow(2, currentRetry - 1);
        logger.info({
          message: `재시도 대기 중 (${backoff}ms)`,
          eventId: event.id,
          attempt: currentRetry,
        });
        await this.sleep(backoff);
        // 재시도: 오프셋 커밋하지 않음 → 재처리됨
      }
    }
  }

  /**
   * DLQ로 메시지 전송
   * DLQ 메시지에는 원본 메시지 + 실패 컨텍스트 포함
   */
  private async sendToDlq(
    message: KafkaMessage,
    failedTopic: string,
    failureReason: string,
    attemptCount: number,
    firstFailedAt?: string
  ): Promise<void> {
    const now = new Date().toISOString();

    let originalEvent: BaseEvent;
    try {
      originalEvent = JSON.parse(message.value?.toString() ?? '{}');
    } catch {
      originalEvent = {
        id: 'unknown',
        type: 'unknown',
        source: 'unknown',
        timestamp: now,
        payload: message.value?.toString(),
      };
    }

    const dlqMessage: DlqMessage = {
      originalMessage: originalEvent,
      failedTopic,
      failureReason,
      attemptCount,
      firstFailedAt: firstFailedAt ?? now,
      lastFailedAt: now,
    };

    try {
      await this.dlqProducer.publish('dlq.message', dlqMessage, {
        key: originalEvent.id,
        traceId: originalEvent.traceId,
      });

      logger.error({
        message: '메시지 DLQ 이동',
        eventId: originalEvent.id,
        eventType: originalEvent.type,
        failedTopic,
        failureReason,
        attemptCount,
        // 실운영에서는 이 로그를 Kibana 알림과 연동
        alert: 'DLQ_MESSAGE',
      });
    } catch (dlqError) {
      // DLQ 전송도 실패한 경우 (최악의 시나리오)
      // 실운영: PagerDuty/Slack 알림 발송 필요
      logger.error({
        message: 'DLQ 전송 실패 — 수동 개입 필요',
        originalEventId: originalEvent.id,
        failureReason,
        dlqError: String(dlqError),
        alert: 'DLQ_SEND_FAILURE_CRITICAL',
      });
    }
  }

  /**
   * Graceful Shutdown
   * SIGTERM 수신 시 현재 처리 중인 메시지 완료 후 종료
   */
  async stop(): Promise<void> {
    logger.info({ message: 'Consumer 종료 시작 (Graceful Shutdown)' });
    this.isRunning = false;
    await this.consumer.disconnect();
    await this.dlqProducer.disconnect();
    logger.info({ message: 'Consumer 종료 완료' });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 프로세스 시그널 핸들러 등록
 * SIGTERM: K8s Pod 종료 신호
 * SIGINT: 로컬 Ctrl+C
 */
export function registerGracefulShutdown(consumer: DlqConsumer): void {
  const shutdown = async (signal: string) => {
    logger.info({ message: `${signal} 수신 — Graceful Shutdown 시작` });
    await consumer.stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}
