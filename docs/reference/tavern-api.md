# SillyTavern 开发参考指南 (Engram 插件版)

本文档汇总了在开发 SillyTavern 扩展（如 Engram）时常用的全局变量、API 和内部机制。

## 1. 核心入口 (Core Entry Point)

酒馆的所有核心功能都通过 `window.SillyTavern` 对象暴露。

### `SillyTavern.getContext()`
这是插件获取运行环境最重要的函数。它返回一个包含几乎所有核心状态和函数的对象。

**返回对象常用字段：**
- `characters`: 当前加载的所有角色卡列表。
- `characterId`: 当前选中角色的 ID (chid)。
- `chat`: 当前聊天历史记录。
- `name1`: 用户名称。
- `name2`: 角色名称。
- `eventSource`: 事件总线（详见第 4 节）。
- `eventTypes`: 事件类型常量名。
- `variables`: 处理本地/全局变量（详见第 2 节）。
- `getRequestHeaders()`: 获取 API 请求所需的认证头。
- `executeSlashCommands(command)`: 执行斜杠指令。
- `saveSettingsDebounced()`: 异步保存酒馆设置。

---

## 2. 变量系统 (Variable System)

酒馆有两种变量作用域，均可通过 `getContext().variables` 访问：

| 作用域 | 存储位置 | 生命周期 | 适用场景 |
| :--- | :--- | :--- | :--- |
| **Local** | `chat_metadata` | 随聊天文件同步 | 角色专属状态、任务进度 |
| **Global** | `extension_settings` | 全局持久化 | 插件配置、用户偏好 |

**常用方法：**
- `get(name)`: 获取变量值。
- `set(name, value)`: 设置变量值。
- `has(name)`: 检查变量是否存在。

---

## 3. 核心数据结构 (Data Structures)

### 聊天消息 (ChatMessage)
定义于 `global.d.ts`：
```typescript
interface ChatMessage {
    name?: string;     // 发送者名称
    mes?: string;      // 消息正文
    is_user?: boolean; // 是否为用户发送
    is_system?: boolean; // 是否为系统消息
    send_date?: string; // 发送时间
    swipes?: string[];  // 所有的 swipe 结果
    swipe_id?: number;  // 当前显示的 swipe 索引
    extra?: Record<string, any>; // 扩展元数据 (Engram 的关键数据也在此)
}
```

---

## 4. 事件系统 (Event System)

通过 `eventSource` 监听酒馆内部状态变化：

```javascript
const { eventSource, eventTypes } = SillyTavern.getContext();

eventSource.on(eventTypes.MESSAGE_RECEIVED, (messageIndex) => {
    console.log("收到新消息，索引：", messageIndex);
});
```

**常用事件：**
- `APP_READY`: 酒馆加载完成。
- `CHAT_CHANGED`: 切换了聊天。
- `CHARACTER_EDITED`: 角色卡被修改。
- `MESSAGE_SENT / RECEIVED`: 消息发送或接收。

---

## 5. 宏与 Prompt 管理

### 宏注册
通过 `SillyTavern.getContext().macros.register(name, { handler, description })` 注册自定义宏。这些宏可以在角色描述、Prompt 模板或世界设定中使用。

### 扩展 Prompt
通过 `setExtensionPrompt(id, content, role, position)` 动态注入 Prompt 到 LLM 上下文中。

---

## 6. 第三方库 (Exposed Libraries)

酒馆已经内置并暴露了以下库，建议直接使用 `window` 下的全局变量，避免重复引入：
- `DOMPurify`: HTML 清洗。
- `toastr`: 弹窗通知。
- `moment`: 时间处理。
- `Fuse`: 模糊搜索。
- `Popper`: 浮窗定位。

---

> **提示**：如需深入了解，请参考 `SillyTavern/public/scripts/st-context.js` 及项目源码。
