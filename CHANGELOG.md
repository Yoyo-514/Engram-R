# 更新日志 (CHANGELOG)

## [release] - 2026-04-16

### Settings / UI Architecture

- 重构设置页结构，将原本集中在单文件中的实现拆分为独立模块：`AppearanceSettingsSection`、`FeatureSettingsSection`、`SyncSettingsSection`、`DatabaseManagementSection` 与通用 `SettingsSection` 容器。
- 设置页主入口改为按模块组织内容，并通过 `LayoutTabs` 统一页面级导航结构，降低设置面板继续扩展时的耦合度。
- 外观、功能、同步、数据管理等配置项的展示职责被显式分层，减少无关状态在同一视图中交叉更新。

### Database / Local Storage

- 为本地数据库管理补充了结构化查询能力，新增数据库摘要与统计类型定义：`DatabaseSummary`、`DatabaseStats`。
- `db.ts` 现在提供统一的数据库枚举、摘要与统计接口，可识别当前聊天、已打开数据库、最近修改时间和归档/向量化数量。
- 设置页新增当前聊天数据库维护、历史数据库浏览、批量清理与统计面板，数据库管理从“单点危险操作”改为“可观测 + 可选择 + 可批量处理”的维护流。
- 联动删除的职责被收敛为聊天删除后的 `IndexedDB` 分片清理与 `Engram_sync_*.json` 同步残留清理，不再混入世界书生命周期管理。

### Memory / Workflow

- 实体提取上下文现在仅向 LLM 暴露活跃实体，避免归档实体被误判为“已存在”而跳过创建。
- 当实体在审核确认或 merge patch 中被更新时，会自动解除归档状态，确保重新活跃的实体重新进入可见与可召回集合。
- 实体工作流保存完成后会补充自动归档检查，使“提取 -> 保存 -> 归档控制”链路保持一致。
- 移除了 `EntityExtractor` 中遗留的旧保存入口与过期注释，减少重复实现与兼容性噪声。

### Prompt / Runtime Behavior

- `plot_director` 提示词已切换为更严格的世界状态调度模型，强调物理约束、情报隔离、社交边界和非上帝视角推演。
- 同步状态判断说明与相关注释被收敛，避免保留已经失效的设备侧判断叙述。

### Legacy Worldbook Cleanup

- 删除了旧的“按角色名 / 按聊天名维护 Engram 世界书”的遗留清理逻辑，不再尝试删除 `[Engram] 角色名` 或 `Engram_角色名` 这类历史命名目标。
- 摘要链中不再保留失效的世界书历史字段：`worldbookMode`、`writtenToWorldbook`、`worldbookEntryId`。
- 移除了不再被消费的旧 facade 别名接口：`findEngramWorldbook`、`ensureEngramWorldbook`、`getChatWorldbook`。
- 当前仅保留“全局唯一世界书 + 宏槽位”的有效路径：`[Engram] Global` 与 `engram_macro_slot`。
