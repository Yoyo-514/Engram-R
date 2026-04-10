# SillyTavern 角色卡与人设系统深度解析 (Persona & Character System)

> 本文档基于对 `char-data.js`、`power-user.js` 以及 V2 规范的源码分析，详细说明角色卡在内存中的实时结构及其扩展机制。

## 1. 角色卡 V1 vs V2 结构对比

酒馆目前主要采用 V2 规范，但在内存中为了兼容性，角色对象（`char`）会同时保留平铺字段和嵌套的 `data` 对象。

### 1.1 基础平铺字段 (Legacy/V1)
这些字段位于角色对象的根部，直接通过 `char.field` 访问：
- `name`: 角色显示名称。
- `description`: 角色详细描述。
- `personality`: 角色性格设定。
- `scenario`: 当前场景设定。
- `first_mes`: 角色开场白。
- `mes_example`: 对话示例。
- `avatar`: 图片文件名（含后缀，如 `character.png`）。

### 1.2 V2 核心对象 (`char.data`)
V2 规范将所有静态设定封装在 `data` 对象中，这是目前推荐的存取位置：
- `data.system_prompt`: 角色专属的系统提示词（覆盖全局设定）。
- `data.post_history_instructions`: 插入至历史记录后的指令。
- `data.extensions`: **核心扩展字典**，包含所有扩展插件的数据。
    - `world`: 绑定的世界书名称。
    - `depth_prompt`: 深度提示词及其插入深度。
- `data.character_book`: 角色内置的世界书条目。

---

## 2. 内存中的扩展字段 (`extension_settings` vs `extra_data`)

酒馆为角色卡提供了两个非结构化存储区域：

### 2.1 `extension_settings` (持久化扩展)
通常用于存储插件专属的配置。例如，本项目的 `tavern_helper` 数据就存放在这里。
- **访问路径**: `char.extension_settings.plugin_id`
- **特性**: 随角色卡一起保存/导出，适合存储长期有效的控制逻辑。

### 2.2 `extra_data` (元数据与临时状态)
- **访问路径**: `char.extra_data`
- **内容**: 包含创作者注释、AI 生成的摘要、甚至是临时的场景上下文。

---

## 3. 用户人设系统 (User Personas)

用户人设不同于角色卡，它是全局共享的配置，存储于 `power_user` 对象中。

### 3.1 `power_user` 中的人设字段
- `power_user.persona_description`: 当前激活的用户人设文本。
- `power_user.persona_description_position`: 插入位置（0: In Prompt, 1: After Char, 等）。
- `power_user.persona_description_role`: 赋予该片段的角色（System/User）。
- `power_user.persona_description_depth`: 插入深度（仅在特定位置生效）。

### 3.2 宏系统交互
酒馆在组装 Prompt 时，会自动解析以下宏：
- `{{user}}`: 用户名称。
- `{{userPersona}}`: 注入 `power_user.persona_description` 的内容。
- `{{char}}`: 角色名称。
- `{{description}}`: 角色描述。

---

## 4. 开发者建议

1. **读取首选**: 始终优先尝试读取 `char.data` 里的字段，如果不存在再回退到根部字段。
2. **扩展开发**: 自己的插件数据应放在 `char.extension_settings['your-plugin-id']` 下，避免污染 `data` 根空间。
3. **监控变化**: 监听 `event_types.CHARACTER_EDITED` 事件以处理人设信息的实时更新。
