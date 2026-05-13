import * as dotenv from 'dotenv';
import { JiraPlugin } from './plugins/jira-plugin';
import { GithubPlugin } from './plugins/github-plugin';
import { Neo4jInjector } from './graph-injector/neo4j-client';
import { PluginRegistry } from './core/plugin-registry';
import { logger } from './core/logger';

dotenv.config();

class DataPipelineOrchestrator {
  private registry: PluginRegistry;
  private graphInjector: Neo4jInjector;

  constructor() {
    this.registry = new PluginRegistry();
    this.graphInjector = new Neo4jInjector();

    // 1. 코어 레지스트리에 도메인별 플러그인 등록
    this.registry.register(new JiraPlugin());
    this.registry.register(new GithubPlugin()); 
  }

  async run() {
    logger.info('🚀 Starting Enterprise Knowledge Data Pipeline...');

    await this.registry.initializeAll();
    const plugins = this.registry.getAllPlugins();

    for (const plugin of plugins) {
      // AsyncGenerator를 통한 대용량 데이터 메모리 제어 (OOM 방지)
      for await (const entity of plugin.extract()) {
        // [Neo4j 도메인 격리 주입]
        await this.graphInjector.injectEntity(entity);
      }
    }

    logger.info('✅ Data Pipeline execution completed.');
    await this.graphInjector.close();
  }
}

// 스크립트 실행 진입점
if (require.main === module) {
  const pipeline = new DataPipelineOrchestrator();
  pipeline.run().catch((error) => {
    logger.error('Pipeline crashed with fatal error', { error });
  });
}

