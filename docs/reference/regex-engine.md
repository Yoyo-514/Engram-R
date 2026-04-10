# SillyTavern 正则引擎深度解析 (Regex Engine)

> 本文档详细说明正则脚本（Regex Scripts）的执行顺序、各级作用域以及处理流。

## 1. 作用域层级 (SCRIPT_TYPES)

正则脚本按照以下优先级执行，数值越小优先级越高（越先执行）：

1. **GLOBAL (0)**: 全局生效，存储在 `extension_settings.regex`。
2. **SCOPED (1)**: 角色专属，存储在角色卡的 `extensions.regex_scripts`。
3. **PRESET (2)**: 预设关联，随当前使用的 AI 预设切换。

---

## 2. 执行位置 (Placement)

正则不仅仅处理最终输出，它可以挂载在消息流的多个节点：

- **USER_INPUT (1)**: 用户点击发送后，发送给 AI 之前。
- **AI_OUTPUT (2)**: AI 生成的内容流回酒馆时。
- **WORLD_INFO (5)**: 在扫描世界书之前对 Haystack 进行清洗。
- **REASONING (6)**: 针对思维链（CoT）内容的专项过滤。
- **SLASH_COMMAND (3)**: 在执行斜杠指令前的预处理。

---

## 3. 编译与缓存 (RegexProvider)

酒馆内部使用 `RegexProvider` 对频繁使用的正则进行 LRU 缓存（默认容量 1000）。
- **LRU 机制**: 每次命中缓存的正则都会被移至末尾，长期不用的旧正则会被自动剔除。
- **状态重置**: 每次从缓存获取时，会自动重置 `lastIndex = 0`。

---

## 4. 替换逻辑与宏支持

正则脚本的替换字符串支持动态宏：
- **`{{match}}`**: 匹配到的原始文本（等价于 `$0`）。
- **`$1, $2...`**: 捕获组支持。
- **参数替换**: 替换后的文本会再次经过 `substituteParams` 处理，这意味着你可以在正则替换中使用 `{{user}}` 等宏。

---

## 5. 正则脚本策略控制

- **MarkdownOnly**: 仅在内容以渲染后的 Markdown 形式显示时生效（不影响发送给 AI 的原始 Token）。
- **PromptOnly**: 仅在组装发送给 AI 的 Prompt 时生效。
- **RunOnEdit**: 是否在用户手动编辑旧消息时重新触发。

---

## 6. 开发者建议

1. **性能警示**: 由于正则通常在主线程上同步执行，复杂的正则表达式或大量的全局脚本会导致严重的输入延迟。
2. **清理习惯**: 建议在 `PLACEMENT.WORLD_INFO` 下去除不必要的特殊符号，以提高世界书的匹配准确度。
3. **调试**: 使用控制台 `SillyTavern.libs.regexFromString("/pattern/flags")` 来预测试你的表达式在酒馆环境下的表现。
