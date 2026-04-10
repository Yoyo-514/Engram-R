<div align="center">
  <img src="public/logo/Engram_logo.svg" alt="Engram Logo" width="250" />

  # Engram

  > **Graph RAG Memory Operation System** - *Where memories leave their trace.*

  ![License](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)
</div>

**Engram** 是专为 **SillyTavern (酒馆)** 设计的下一代智能记忆扩展。它通过**RAG (检索增强生成)** 技术，不仅提供直观的记忆可视化，更能让 AI 角色拥有持久、连贯且可追溯的记忆能力。

---

## 🛠️ 技术栈 (Tech Stack)

![React](https://img.shields.io/badge/React-20232a?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Zustand](https://img.shields.io/badge/Zustand-bear?style=for-the-badge&color=orange)
![Dexie](https://img.shields.io/badge/Dexie.js-323330?style=for-the-badge&logo=indexeddb&logoColor=white)

---

## ✨ 核心特性 (Features)

- **Memory Stream (记忆流)**: 以时间轴形式直观展示所有记忆片段，支持重要度高亮。
- **Story Summary (剧情总结)**: 内置纯文本双层记忆总结系统，自动提炼关键剧情，防止上下文遗忘。
- **API Presets (API 预设)**: 灵活配置多种 LLM 接口，支持针对不同任务（总结、提取）使用不同模型。
- **Modern UI (现代化界面)**: 采用 Glassmorphism 设计语言，配合流畅动画，提供原生应用级体验。
- **Dev Log (开发日志)**: 内置实时日志查看器，方便调试与监控。

---

## 📦 安装 (Installation)

### 方式一：扩展管理 (推荐)

直接在 **SillyTavern** 的扩展管理界面安装：

1. 打开扩展管理 (Extensions) -> **安装扩展 (Install Extension)**。
2. 在 URL 栏输入本仓库地址：
   ```
   https://github.com/shiyue137mh-netizen/Engram
   ```
3. 点击 **获取 (Get)** 或 **安装 (Install)**。
4. 安装完成后，刷新酒馆页面即可。

> **注意**: 我们已将构建好的 `dist/` 目录上传至仓库，因此无需手动构建即可直接使用。

### 方式二：Git 克隆 (开发者)

```bash
cd SillyTavern/public/scripts/extensions/third-party/
git clone https://github.com/shiyue137mh-netizen/Engram.git
cd Engram
# 如果仅使用，无需 npm install/build
```

---

## 💻 开发指南 (Development)

如果您想参与开发或自行构建：

```bash
# 安装依赖（推荐 pnpm）
pnpm install

# 启动 HMR 开发模式 (推荐)
# 支持热更新，修改代码后无需刷新浏览器
pnpm run dev

# 生产环境构建
pnpm run build

# 传统监听模式
pnpm run dev:watch
```

> 说明：项目已切换为 `pnpm` 工作流，建议使用 `pnpm-lock.yaml` 进行依赖锁定与安装。

---

## 📁 目录结构 (Project Structure)
参考"docs/architecture/项目文件架构.md"

---

## 📄 开源协议 (License)

MIT License
