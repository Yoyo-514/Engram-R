# 更新日志 (CHANGELOG)

## [1.1.2] - 2026-08-23

### Bug Fixes

- 修复运行日志列表不显示（只剩底部条数）的问题：页面内容容器使用 `min-h-full` 导致高度链断裂，虚拟列表容器高度塌陷为 0；改为确定高度后日志正常渲染。
- 数据库维护卡片增加空数据指示：历史库与当前聊天库在无事件、无实体时显示「空」徽章，当前库副标题区分「该数据库暂无数据」与「当前聊天无数据库记录」。

## [1.1.1] - 2026-08-23

### Performance / DevLog

- 运行日志列表改为 `react-virtuoso` 虚拟化渲染，5000 条日志仅挂载可视区域，配合分组折叠保持 Docker 风格展示。
- 日志订阅改为 100ms 批量合并 setState，高频日志下渲染频率从每条一次降到每秒最多 10 次；过滤逻辑改为 useMemo 派生，消除双重渲染。
- 自动滚动改用 `followOutput`，仅在用户位于底部时平滑跟随，替代每条日志触发 `scrollIntoView`。
- Logger 写入侧增加 payload 截断（序列化上限 4096 字符），缓存裁剪改为惰性批量（超过 125% 才裁剪），大对象内存占用受控。
- 日志条目组件 memo 化，data 预览序列化结果缓存并限制展示长度。
- ModelLogger 配对由 O(n²) 优化为 O(n)，接收阶段改为不可变更新，LogCard memo 化后仅重渲染变化的卡片。
- 修复 Logger 通过 events 桶文件引入的隐藏循环依赖（events → tavern → PromptLoader 顶层调用 Logger），改为深度导入事件总线。

### Database / Local Storage

- 新增数据库绑定状态判定（active / orphaned / unknown），综合当前聊天、角色活跃聊天、context.chats 与 `/api/chats`（30s 缓存）多层枚举；枚举失败降级 unknown，不误判孤立库。
- 新增孤立库手动重绑定：导出源库 → 覆盖导入当前聊天库 → 删除源库，解决聊天导出/重新导入后 chatId 变化导致的孤立库无法复用问题。
- 设置页数据库维护区单独成组展示孤立库（橙色徽章）与状态未知库，卡片提供「绑定到当前聊天」操作，绑定成功后自动重置内存状态并刷新列表。

### Mobile UI / Responsive

- 修复 14 处移动端文本溢出：SimpleModal、MobileFullscreenForm、UpdateNotice、Button、QuickLinks、RecallLog、LogEntryItem、EventList、MessageReview、ReviewContainer、VectorizationPanel、Dashboard 快速入口、EntityReview 等，统一补 `min-w-0` / `break-words` / `flex-wrap` / `truncate` 处理。

### Memory Stream / Recall UI

- 事件列表默认排序改为「新到旧」，最新事件与日期分组置顶；实体排序补充稳定 tiebreaker（时间相同时按名称），旧数据不再乱序。
- 排序与激活控件统一移到列表内顶部（搜索框下方），事件页与实体页布局一致；ActionBar 不再承载排序/激活按钮。
- 实体列表新增「只看激活」过滤，数据来自类脑缓存中 category 为 entity 的槽位。
- 补齐 `RETRIEVAL_COMPLETE` 事件链路（此前定义但从未发出），召回完成后记忆流激活状态实时刷新。

### RAG / Token Control

- 召回注入增加最终截断：类脑加成后按最终分数重排，注入候选截断到 `rerankConfig.topN`（默认 5），无论 rerank 是否开启都生效；此前合并后的全部候选（最多 50 个事件）会被整体注入。
- 召回实体注入上限 10 个（按召回权重取前 N），实体状态文本受控。
- 类脑短时记忆快照的事件放行路径同样受 topN 截断约束，聊天切换/设置更新时不再全量放行归档事件。
