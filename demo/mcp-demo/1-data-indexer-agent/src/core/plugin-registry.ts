import { IndexerPlugin, KnowledgeEntity } from '../plugins/base-plugin';
import { logger } from './logger';

export class PluginRegistry {
  private plugins: Map<string, IndexerPlugin> = new Map();

  /**
   * 플러그인 동적 등록
   */
  register(plugin: IndexerPlugin): void {
    if (this.plugins.has(plugin.domainName)) {
      logger.warn(`Plugin for domain ${plugin.domainName} is already registered. Overwriting.`, { domain: plugin.domainName });
    }
    this.plugins.set(plugin.domainName, plugin);
    logger.info(`Registered plugin: ${plugin.domainName}`, { domain: plugin.domainName });
  }

  /**
   * 등록된 모든 플러그인 반환
   */
  getAllPlugins(): IndexerPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * 플러그인 일괄 초기화
   */
  async initializeAll(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      await plugin.initialize();
    }
  }
}
