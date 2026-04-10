# SillyTavern 消息容器与 chat 数组结构 (Message Container)

> 本文档定义聊天记录数组 `chat` 中每一个对象的标准字段及 `extra` 字段的深层含义。

## 1. 核心字段定义

聊天记录是一个 `ChatMessage` 对象数组。

- **`name`**: 消息发送者的名称（如用户名或角色名）。
- **`mes`**: 消息的正文内容。
- **`is_user`**: 布尔值，标记该消息是否由人类用户发出。
- **`send_date`**: 时间戳（通常由后端生成）。
- **`force_avatar`**: 布尔值，用于在群聊或特殊场景下强制显示特定头像。

---

## 2. `extra` 字典：消息的元数据中心

这是开发者最需要关注的部分，包含了消息的所有扩展属性。

### 2.1 消息类型 (`type`)
- `system`: 系统自动生成的消息。
- `narrator`: 旁白/旁白模式产生的内容。

### 2.2 生成信息
- **`api`**: 生成该条消息的后端 ID（如 `openai`）。
- **`model`**: 具体使用的模型名称。
- **`reasoning_signature`**: 获取到的思维链（Reasoning/CoT）签名字段，用于显示或后续追踪。

### 2.3 状态与控制
- **`[IGNORE_SYMBOL]`**: 若存在此 key，该条消息在组装任何 Prompt 时都会被完全跳过。
- **`swiped`**: 如果存在，表示该消息正在进行横扫（Swipe）切换。
- **`swipes`**: 存储横扫列表的数组，记录了 AI 提供过的备选回复。

### 2.4 多媒体与交互
- **`media`**: 附件列表（如图片链接、音频元数据）。
- **`tool_invocations`**: 记录了 AI 进行的函数调用（Tool Calls）及其结果。

---

## 3. 消息操作流程

1. **追加**: 通过 `chat.push(newMessage)`。
2. **渲染**: 酒馆会监听聊天变化并自动更新 DOM。
3. **持久化**: 通过 `saveChatConditional()` 实现增量保存。

---

## 4. 开发者建议

1. **非侵入式修改**: 如果需要为消息添加自定义状态，请挂载在 `extra` 对象下，例如 `extra.your_plugin_state = true`。
2. **过滤处理**: 在处理历史记录时，务必检查 `extra[IGNORE_SYMBOL]`，否则你的插件可能会统计到不应出现在上下文中的文本。
3. **思维链隔离**: 永远不要直接修改 `mes` 字段来添加 CoT 内容，而应利用 `extra.reasoning_signature`，以保持界面的正确分层。
