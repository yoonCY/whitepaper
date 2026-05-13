export interface KnowledgeEntity {
  id: string;             // 고유 식별자 (예: JIRA-PAY-821)
  domain: string;         // 도메인 분리를 위한 네임스페이스 (예: JIRA, GITHUB, WIKI)
  type: string;           // 엔티티 타입 (예: TICKET, COMMIT, DOCUMENT)
  title: string;
  content: string;        // BM25 인덱싱을 위한 원문 데이터
  metadata: Record<string, any>;
  relationships: KnowledgeRelation[];
}

export interface KnowledgeRelation {
  targetId: string;       // 연결 대상 ID
  targetDomain: string;   // 연결 대상 도메인 (도메인 간 Cross-Linking 지원)
  relationType: string;   // 관계 종류 (예: DEPENDS_ON, MENTIONS)
  weight: number;         // RRF 검색 시 가중치 반영용
}

export interface IndexerPlugin {
  domainName: string;
  
  /**
   * 플러그인 초기화 및 인증
   */
  initialize(): Promise<void>;

  /**
   * 데이터 소스에서 비정형 데이터를 수집하고 KnowledgeEntity 형태로 정형화하여 반환
   */
  extract(): AsyncGenerator<KnowledgeEntity, void, unknown>;
}
