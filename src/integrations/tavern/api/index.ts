/**
 * 酒馆接口层 - 统一导出
 *
 * 提供 SillyTavern 事件、消息、世界书等功能的封装
 */
import { eventBus, isNativeWorldbookTokenCountAvailable, isWorldInfoAvailable,  } from '@/integrations/tavern';
import { getFloorCount, isMessageServiceAvailable, getCurrentCharacterName as getCurrentCharName  } from './Message';

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
    eventBus: eventBus.isAvailable(),
    messageService: isMessageServiceAvailable(),
    worldInfoService: isWorldInfoAvailable(),
    nativeTokenCount: await isNativeWorldbookTokenCountAvailable(),
    floorCount: isMessageServiceAvailable() ? getFloorCount() : null,
    characterName: isMessageServiceAvailable() ? getCurrentCharName() : null,
  };

  return status;
}
