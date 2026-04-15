import { Logger } from '@/core/logger';
import { useMemoryStore } from '@/state/memoryStore';
import { type JobContext } from '@/types/job_context';
import { type IStep } from '@/types/step';

export class FetchExistingEntities implements IStep {
  name = 'FetchExistingEntities';

  async execute(context: JobContext): Promise<void> {
    const store = useMemoryStore.getState();
    const entities = await store.getAllEntities();

    // 分离活跃实体与归档实体
    // LLM 提示词中只展示活跃实体，避免 LLM 误认为归档实体 "已存在" 而跳过创建
    const activeEntities = entities.filter((e) => !e.is_archived);

    // 简化实体信息，用于 Prompt 上下文 (仅活跃实体)
    const simplified = activeEntities.map((e) => ({
      name: e.name,
      type: e.type,
      aliases: e.aliases || [],
    }));

    context.input.existingEntities = JSON.stringify(simplified, null, 2);

    // 存入完整对象供 SaveEntity 使用 (含归档实体，用于消歧和自动解除归档)
    context.input._rawExistingEntities = entities;

    Logger.debug(
      'FetchExistingEntities',
      `获取了 ${entities.length} 个现有实体 (活跃: ${activeEntities.length}, 归档: ${entities.length - activeEntities.length})`
    );
  }
}
