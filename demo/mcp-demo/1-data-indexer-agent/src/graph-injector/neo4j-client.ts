import neo4j, { Driver, Session } from 'neo4j-driver';
import { KnowledgeEntity } from '../plugins/base-plugin';
import { logger } from '../core/logger';

export class Neo4jInjector {
  private driver: Driver;

  constructor() {
    const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    const user = process.env.NEO4J_USER || 'neo4j';
    const password = process.env.NEO4J_PASSWORD || 'password';
    
    this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  }

  /**
   * 도메인 충돌 방지: Node Label을 `Entity:{Domain}:{Type}` 형태로 다중 지정
   */
  async injectEntity(entity: KnowledgeEntity): Promise<void> {
    const session: Session = this.driver.session();
    try {
      // 1. 엔티티 노드 병합 (MERGE) - 도메인 네임스페이스 격리
      // 예: (:Entity:JIRA:TICKET {id: "JIRA-123"})
      const query = `
        MERGE (n:Entity:${entity.domain}:${entity.type} { id: $id, domain: $domain })
        SET n.title = $title,
            n.metadata = $metadata,
            n.updatedAt = datetime()
        RETURN n
      `;
      
      await session.run(query, {
        id: entity.id,
        domain: entity.domain,
        title: entity.title,
        metadata: JSON.stringify(entity.metadata)
      });

      logger.info(`Injected Node: [${entity.domain}] ${entity.id}`, { entityId: entity.id, domain: entity.domain });

      // 2. 관계 주입 (Cross-Domain 연결 지원)
      if (entity.relationships && entity.relationships.length > 0) {
        for (const rel of entity.relationships) {
          // 대상 노드가 없으면 빈 노드라도 생성 (나중에 해당 도메인 플러그인이 채움)
          const relQuery = `
            MATCH (src:Entity:${entity.domain} {id: $srcId})
            MERGE (tgt:Entity:${rel.targetDomain} {id: $tgtId, domain: $tgtDomain})
            MERGE (src)-[r:${rel.relationType}]->(tgt)
            SET r.weight = $weight, r.updatedAt = datetime()
          `;
          await session.run(relQuery, {
            srcId: entity.id,
            tgtId: rel.targetId,
            tgtDomain: rel.targetDomain,
            weight: rel.weight
          });
          logger.info(`  └─ Link: (${entity.id}) -[${rel.relationType}]-> (${rel.targetId} @${rel.targetDomain})`);
        }
      }
    } catch (error) {
      logger.error(`Failed to inject entity ${entity.id}`, { entityId: entity.id, error });
    } finally {
      await session.close();
    }
  }

  async close() {
    await this.driver.close();
  }
}
