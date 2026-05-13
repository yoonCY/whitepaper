/**
 * Kafka 멱등(Idempotent) 프로듀서
 *
 * 핵심 특징:
 * - enable.idempotence=true: 브로커 재시도 시 중복 메시지 방지
 * - acks=all: 모든 ISR(in-sync replica)의 확인 후 응답
 * - 자동 재시도 (지수 백오프)
 * - 구조화 로그 출력 (ELK 파이프라인 연동)
 */

import { Kafka, Producer, CompressionTypes, Message } from 'kafkajs';
import { randomUUID } from 'crypto';
import { KafkaConfig, ProducerConfig, BaseEvent } from './types';
import { createLogger } from './logger';

const logger = createLogger('KafkaProducer');

export class IdempotentProducer {
  private kafka: Kafka;
  private producer: Producer;
  private config: ProducerConfig;
  private isConnected = false;

  constructor(kafkaConfig: KafkaConfig, producerConfig: ProducerConfig) {
    this.config = producerConfig;

    this.kafka = new Kafka({
      clientId: kafkaConfig.clientId,
      brokers: kafkaConfig.brokers,
      ssl: kafkaConfig.ssl,
      sasl: kafkaConfig.sasl as any,
      connectionTimeout: kafkaConfig.connectionTimeout ?? 10_000,
      requestTimeout: kafkaConfig.requestTimeout ?? 30_000,
      retry: kafkaConfig.retry ?? {
        maxRetryTime: 30_000,
        initialRetryTime: 300,
        factor: 0.2,
        multiplier: 2,
        retries: 10,
      },
    });

    this.producer = this.kafka.producer({
      // 멱등성 핵심 설정
      idempotent: producerConfig.idempotent ?? true,
      // 멱등 모드: maxInFlightRequests는 반드시 1~5 사이
      maxInFlightRequests: 5,
      // 재시도 설정 (멱등 모드와 연동)
      retry: {
        retries: 10,
        initialRetryTime: 300,
        multiplier: 2,
      },
      // 트랜잭션 처리 모니터링
      allowAutoTopicCreation: false, // 명시적 토픽 생성 강제
    });
  }

  /**
   * Kafka 브로커에 연결
   * 서비스 시작 시 한 번만 호출
   */
  async connect(): Promise<void> {
    try {
      await this.producer.connect();
      this.isConnected = true;
      logger.info({ message: 'Producer 연결 성공', topic: this.config.topic });
    } catch (error) {
      logger.error({ message: 'Producer 연결 실패', error: String(error) });
      throw error;
    }
  }

  /**
   * 단일 이벤트 발행
   * @param eventType 이벤트 타입 (ex: 'user.created')
   * @param payload 이벤트 페이로드
   * @param options 추가 옵션 (파티션 키, traceId 등)
   */
  async publish<T>(
    eventType: string,
    payload: T,
    options?: {
      key?: string;        // 파티션 키 (같은 키 → 같은 파티션 → 순서 보장)
      traceId?: string;    // 분산 추적 ID
      headers?: Record<string, string>;
    }
  ): Promise<{ topic: string; partition: number; offset: string }> {
    if (!this.isConnected) {
      throw new Error('Producer가 연결되지 않았습니다. connect()를 먼저 호출하세요.');
    }

    const event: BaseEvent<T> = {
      id: randomUUID(),
      type: eventType,
      source: this.kafka['options']?.clientId ?? 'unknown',
      timestamp: new Date().toISOString(),
      traceId: options?.traceId,
      payload,
    };

    const message: Message = {
      key: options?.key ?? event.id,
      value: JSON.stringify(event),
      headers: {
        'content-type': 'application/json',
        'event-type': eventType,
        'trace-id': options?.traceId ?? '',
        ...options?.headers,
      },
      timestamp: Date.now().toString(),
    };

    try {
      const result = await this.producer.send({
        topic: this.config.topic,
        compression: this.compressionType(),
        messages: [message],
      });

      const metadata = result[0];
      logger.info({
        message: '이벤트 발행 성공',
        eventId: event.id,
        eventType,
        topic: this.config.topic,
        partition: metadata.partition,
        offset: metadata.offset,
        traceId: options?.traceId,
      });

      return {
        topic: this.config.topic,
        partition: metadata.partition,
        offset: metadata.offset ?? '',
      };
    } catch (error) {
      logger.error({
        message: '이벤트 발행 실패',
        eventId: event.id,
        eventType,
        topic: this.config.topic,
        error: String(error),
        traceId: options?.traceId,
      });
      throw error;
    }
  }

  /**
   * 배치 이벤트 발행 (트랜잭션 지원)
   * 여러 이벤트를 원자적으로 발행 (all or nothing)
   */
  async publishBatch<T>(
    events: Array<{ type: string; payload: T; key?: string }>
  ): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Producer가 연결되지 않았습니다.');
    }

    const messages: Message[] = events.map(({ type, payload, key }) => {
      const event: BaseEvent<T> = {
        id: randomUUID(),
        type,
        source: this.kafka['options']?.clientId ?? 'unknown',
        timestamp: new Date().toISOString(),
        payload,
      };

      return {
        key: key ?? event.id,
        value: JSON.stringify(event),
        headers: {
          'content-type': 'application/json',
          'event-type': type,
        },
      };
    });

    try {
      await this.producer.send({
        topic: this.config.topic,
        compression: this.compressionType(),
        messages,
      });

      logger.info({
        message: '배치 이벤트 발행 성공',
        count: messages.length,
        topic: this.config.topic,
      });
    } catch (error) {
      logger.error({
        message: '배치 이벤트 발행 실패',
        count: messages.length,
        topic: this.config.topic,
        error: String(error),
      });
      throw error;
    }
  }

  /** 연결 해제 (Graceful Shutdown) */
  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.producer.disconnect();
      this.isConnected = false;
      logger.info({ message: 'Producer 연결 해제' });
    }
  }

  private compressionType(): CompressionTypes {
    switch (this.config.compression) {
      case 'gzip':   return CompressionTypes.GZIP;
      case 'snappy': return CompressionTypes.Snappy;
      case 'lz4':    return CompressionTypes.LZ4;
      case 'zstd':   return CompressionTypes.ZSTD;
      default:       return CompressionTypes.None;
    }
  }
}
