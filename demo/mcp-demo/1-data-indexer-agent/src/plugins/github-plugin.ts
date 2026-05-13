import { IndexerPlugin, KnowledgeEntity } from './base-plugin';
import { ParserFactory } from '../parsers/ast-parser-factory';
import { logger } from '../core/logger';
import * as fs from 'fs';
import * as path from 'path';

export class GithubPlugin implements IndexerPlugin {
  public readonly domainName = 'GITHUB';

  async initialize(): Promise<void> {
    logger.info(`[GithubPlugin] Initializing via org: ${process.env.GITHUB_ORG_NAME || 'local-org'}`);
  }

  async *extract(): AsyncGenerator<KnowledgeEntity, void, unknown> {
    logger.info(`[GithubPlugin] Extracting source code from domain: ${this.domainName}`);
    
    // 포트폴리오 데모용: mock-data의 소스코드(.ts, .php, .java) 파일을 스캔
    const mockDir = path.join(__dirname, '../../mock-data');
    if (!fs.existsSync(mockDir)) return;

    const files = fs.readdirSync(mockDir).filter(f => f.endsWith('.ts') || f.endsWith('.php') || f.endsWith('.java'));
    
    for (const file of files) {
      const content = fs.readFileSync(path.join(mockDir, file), 'utf-8');
      const fileName = file;
      
      // Factory를 이용해 확장자에 맞는 AST 파서 동적 할당
      const parser = ParserFactory.getParserForFile(fileName);
      const parsedEntities = parser ? parser.parseSourceCode(fileName, content) : [];

      // 전체 파일 엔티티 생성
      yield {
        id: fileName,
        domain: this.domainName,
        type: 'REPOSITORY_FILE',
        title: fileName,
        content: content,
        metadata: {
          language: path.extname(fileName).replace('.', ''),
          parsedEntities: parsedEntities
        },
        relationships: [
          // Jira 티켓 JIRA-PAY-821과 교차 연결. (코드 내 주석에 JIRA-PAY-821이 있으므로 자동 연결한다고 가정)
          {
            targetId: 'JIRA-PAY-821',
            targetDomain: 'JIRA',
            relationType: 'IMPLEMENTS_TICKET',
            weight: 2.0
          }
        ]
      };
      
      logger.info(`[GithubPlugin] AST Parsed ${parsedEntities.length} entities from ${fileName}`);
    }
  }
}
