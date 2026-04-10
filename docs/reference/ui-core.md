# SillyTavern UI 核心组件与交互指南 (UI & UX Core)

> 本文档总结了酒馆内置的高级 UI 库，帮助开发者创建与系统风格一致的交互界面。

## 1. 弹窗系统 (`Popup`)

源码位置：`public/scripts/popup.js`。这是酒馆最强大的交互工具。

### 1.1 `POPUP_TYPE` (弹窗类型)
- `TEXT (1)`: 标准文本确认框。
- `CONFIRM (2)`: 是/否选择框。
- `INPUT (3)`: 带文本输入字段。
- `DISPLAY (4)`: 纯展示，无确认按钮，仅右上角 X。

### 1.2 `callGenericPopup` 参数签名
```javascript
/**
 * @param {string|HTMLElement} content - 内容
 * @param {number} type - POPUP_TYPE
 * @param {string} inputValue - 初始值
 * @param {object} options - 详细配置
 */
callGenericPopup(content, type, inputValue, options);
```

### 1.3 `options` 深度配置
- `okButton`: 自定义确认按钮文本（或设为 `false` 隐藏）。
- `cancelButton`: 自定义取消按钮文本。
- `wide`: 布尔值，开启宽屏模式。
- `large`: 开启全屏模式（90% 占比）。
- `rows`: 输入框行数。
- `onClosing`: 关闭前的回调，返回 `false` 可阻止关闭。

---

## 2. 通知系统 (`toastr`)

酒馆全局暴露了 `toastr` 库，建议使用封装好的 `scripts/extensions.js` 中的导出（如果有），或直接调用：
- `toastr.success(message, title)`
- `toastr.error(message, title)`
- `toastr.info(message, title)`
- `toastr.warning(message, title)`

---

## 3. 加载与掩模 (`Loader`)

在进行耗时操作时（如 AI 生成、大量文件解析），应使用全局 Loader。

### 3.1 `showLoader()`
- **作用**: 显示全局旋转加载动画。
- **机制**: 内部维护计数器，多次调用需要对应次数的 `hideLoader`。

### 3.2 `hideLoader()`
- **作用**: 隐藏加载动画。

---

## 4. 图标库 (FontAwesome)

酒馆内置了 FontAwesome 6。在 UI 开发中，应优先使用其类名：
- `<i class="fa-solid fa-gear"></i>` (设置)
- `<i class="fa-solid fa-circle-info"></i>` (信息)
- `<i class="fa-solid fa-trash"></i>` (删除)

---

## 5. 样式建议

1. **CSS 变量**: 始终使用 `--SmartTheme...` 变量以适配用户的酒馆主题。
    - `var(--SmartThemeBodyColor)`: 文字颜色。
    - `var(--SmartThemeBgColor)`: 背景颜色。
2. **交互一致性**: 尽量避免创建独立的模态窗口，而是通过 `Popup` 类包装你的 React 组件。
