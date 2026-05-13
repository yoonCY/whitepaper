import winston from 'winston';
import * as path from 'path';

// 로그 파일이 저장될 디렉토리
const logDir = path.join(__dirname, '../../../logs');

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json() // 운영 환경 (ElasticSearch 등) 파싱을 위한 JSON 구조화
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'data-indexer-agent' },
  transports: [
    // 1. 에러 전용 로그 파일 (장애 추적용)
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'), 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // 2. 전체 이벤트 로그 파일 (데이터 파이프라인 추적용)
    new winston.transports.File({ 
      filename: path.join(logDir, 'indexer.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// 개발 모드일 경우 콘솔에도 사람이 읽기 편하게(pretty-print) 출력
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        return `[${timestamp}] ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
      })
    )
  }));
}
