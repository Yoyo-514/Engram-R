# SillyTavern 提示词聚合与组装逻辑 (Prompt Aggregation)

> 本文档解密酒馆如何将多来源（系统、角色、世界书、扩展）的文本片段组装成最终发送给 AI 的 Prompt。

## 1. 核心排序法则：深度 (Depth) 与 顺序 (Order)

所有注入片段（Injections）最终都会根据 `injection_depth` 进行排序。

### 1.1 深度 (Injection Depth)
- **Depth 0**: 最靠近 AI 回复回复的位置（Prompt 的底部）。
- **Depth N**: 向上偏移 N 条消息后的位置。
- **System Prompt**: 通常位于极其靠后的位置（逻辑意义上的顶部）。

### 1.2 组装顺序 (Injection Order)
当多个片段位于**相同深度**时，由 `injection_order` 决定：
- **排序算法**: 降序排列（`b - a`）。
- **规则**: `injection_order` **数值越大，在同一深度内的位置越靠下**（即更接近回复）。
- **默认值**: 100。

---

## 2. 来源优先级与合并逻辑

提示词来源按以下顺序扫描并应用：
1. **System Prompts**: 模板定义的 `main` / `nsfw` / `jailbreak`。
2. **Character Data**: 角色自带的 `system_prompt` 或 `post_history_instructions`。
3. **World Info**: 已激活的世界书条目（按其自身的 Depth 插入）。
4. **Extension Prompts**: 插件通过 `extension_prompt_types` 注入的内容。

---

## 3. 角色 (Roles) 的影响

每个片段都会被赋予一个角色（Role）：
- **System**: 系统指令，通常具有最高权威感。
- **User**: 用户视角的话语。
- **Assistant**: 模拟 AI 的回复片段。

在相同的深度和顺序下，酒馆会按照 `[System -> User -> Assistant]` 的顺序进行组装（  最靠近底部）。

---

## 4. 提示词管理器 (`PromptManager`)

`PromptManager` 是用户控制组装逻辑的 UI 层。
- **Absolute**: 片段位于固定的消息行数位置。
- **Relative**: 片段随聊天历史动态滚动。

---

## 5. 开发者建议

1. **避免竞争**: 给你的插件逻辑分配一个独特的 `injection_order`（例如 500），以确保它在大多数通用插件（100）之后被处理。
2. **深度感知**: 涉及即时逻辑的指令应设为 `Depth 0`，涉及长期人设的说明应设为 `Depth 4` 或更高。
3. **宏替换**: 所有的聚合片段在合并前都会经过 `substituteParams`，你可以利用这一特性在不同的片段间传递状态。
