/**
 * 酒馆接口层 - 统一导出
 *
 * 提供 SillyTavern 事件、消息、世界书等功能的封装
 */

export { WorldInfoService } from '../worldbook';
import { EventBus, WorldInfoService } from '@/integrations/tavern';
import { MessageService } from './Message';

/**
 * 检查酒馆接口对接状态
 * 输出 JSON 格式的状态报告到 DevLog
 */
export async function checkTavernIntegration(): Promise<{
  eventBus: boolean;
  messageService: boolean;
  worldInfoService: boolean;
  nativeTokenCount: boolean;
  floorCount: number | null;
  characterName: string | null;
}> {
  const status = {
    eventBus: EventBus.isAvailable(),
    messageService: MessageService.isAvailable(),
    worldInfoService: WorldInfoService.isAvailable(),
    nativeTokenCount: await WorldInfoService.isNativeTokenCountAvailable(),
    floorCount: MessageService.isAvailable() ? MessageService.getFloorCount() : null,
    characterName: MessageService.isAvailable() ? MessageService.getCurrentCharacterName() : null,
  };

  return status;
}
