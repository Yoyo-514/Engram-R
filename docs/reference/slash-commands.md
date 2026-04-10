# SillyTavern 斜杠指令与 STscript 深度手册 (Slash Commands)

> 本文档深入解析酒馆的指令解析器 `SlashCommandParser` 以及如何编写符合规范的斜杠指令。

## 1. 指令注册机制

指令的核心逻辑位于 `public/scripts/slash-commands.js`。所有指令通过 `SlashCommandParser.addCommandObject` 进行注册。

### 1.1 `SlashCommand` 构造参数
注册一个指令需要提供以下属性：
- `name`: 指令名（不带斜杠）。
- `aliases`: 别名数组。
- `callback`: 处理函数 `async (args, value) => { ... }`。
- `unnamedArgumentList`: 匿名参数定义列表。
- `namedArgumentList`: 命名参数定义列表。
- `helpString`: 在 `/help` 中显示的 HTML 说明。

---

## 2. 参数处理逻辑

酒馆的 `STscript` 是强类型的，参数在进入 `callback` 前会被解析。

### 2.1 匿名参数 (Unnamed Arguments)
- 指令后直接跟随的文本：`/cmd "value"`。
- 在 `callback` 中作为第二个参数接收。

### 2.2 命名参数 (Named Arguments)
- 键值对形式：`/cmd arg=value`。
- 在 `callback` 中通过第一个参数对象 `args` 访问。
- **示例**: `args.quiet` 或 `args.depth`。

---

## 3. 核心 API 调用

开发者在扩展中执行指令通常有两种方式：

### 3.1 `executeSlashCommands(text)` (直接执行)
最常用的方法，会完整模拟用户输入。
- **特点**: 会被日志记录，受权限检查影响。
- **源码**: `script.js` 导出。

### 3.2 `SlashCommandParser.execute(text, options)` (低级调用)
绕过 UI 逻辑直接调用解析器。
- **场景**: 在循环或自动化工具中调用，需要极高性能时使用。

---

## 4. 常用内置指令深度参考

| 指令 | 作用 | 开发者贴士 |
| :--- | :--- | :--- |
| `/setvar` | 设置本地/全局变量 | 可用于在不同指令间传递状态 |
| `/getvar` | 获取变量值 | |
| `/trigger` | 触发全局事件 | 非常适合用于不同插件间的通信 |
| `/impersonate`| 模拟角色回复 | 可以通过 `quiet_prompt` 注入隐藏指令 |
| `/bg` | 切换背景 | 接受部分匹配的文件名 |

---

## 5. 编写最佳实践

1. **异步处理**: `callback` 必须是 `async` 的，特别是涉及文件读写或网络请求时。
2. **错误反馈**: 推荐使用 `toastr` 进行用户反馈，但在 `quiet` 模式下应保持沉默。
3. **Pipe 流入**: 注意处理 `value`。指令可以被管道符连接：`/cmd1 | /cmd2`。`cmd2` 的 `value` 将是 `cmd1` 的返回值。
