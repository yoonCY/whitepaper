import { IndexerPlugin, KnowledgeEntity } from './base-plugin';
import * as fs from 'fs';
import * as path from 'path';

export class JiraPlugin implements IndexerPlugin {
  public readonly domainName = 'JIRA';

  async initialize(): Promise<void> {
    console.log(`[JiraPlugin] Initializing Jira connection via ${process.env.JIRA_BASE_URL}...`);
    // 실제 구현: axios 등을 이용한 OAuth / Basic Auth 세팅
  }

  async *extract(): AsyncGenerator<KnowledgeEntity, void, unknown> {
    console.log(`[JiraPlugin] Extracting tickets from domain: ${this.domainName}`);
    
    // 포트폴리오 데모용: mock-data 폴더의 마크다운 파일을 파싱하는 로직으로 대체
    const mockDir = path.join(__dirname, '../../mock-data');
    if (!fs.existsSync(mockDir)) return;

    const files = fs.readdirSync(mockDir).filter(f => f.startsWith('JIRA-'));
    
    for (const file of files) {
      const content = fs.readFileSync(path.join(mockDir, file), 'utf-8');
      const ticketId = file.replace('.md', '');
      
      // AST 기반 마크다운 파싱을 가정 (본 데모에서는 정규식으로 간단히 추출)
      const titleMatch = content.match(/# (.*)/);
      const title = titleMatch ? titleMatch[1] : ticketId;

      yield {
        id: ticketId,
        domain: this.domainName,
        type: 'TICKET',
        title: title,
        content: content,
        metadata: {
          status: 'RESOLVED',
          priority: 'HIGH',
          sourceFile: file
        },
        relationships: [
          // 도메인 간 교차 연결 예시 (Jira -> GitHub)
          {
            targetId: 'legacy-payment-svc',
            targetDomain: 'GITHUB',
            relationType: 'AFFECTS_REPOSITORY',
            weight: 1.5
          }
        ]
      };
    }
  }
}
