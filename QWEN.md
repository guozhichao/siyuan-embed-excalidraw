# SiYuan Embed Excalidraw 项目上下文

## 项目概述

这是一个 **思源笔记 (SiYuan) 插件**，用于在思源笔记中嵌入 Excalidraw 绘图功能。插件允许用户直接在思源笔记中创建和编辑高质量的 SVG/PNG 矢量图形，所有编辑信息直接嵌入到图像文件中，确保内容可移植和可分享。

### 核心技术栈

- **框架**: React 19 + TypeScript
- **构建工具**: Vite 6
- **包管理器**: pnpm
- **核心库**: 
  - `@excalidraw/excalidraw` - Excalidraw 绘图引擎
  - `siyuan` - 思源笔记插件 SDK
- **代码规范**: ESLint (@antfu/eslint-config)

### 项目架构

```
siyuan-embed-excalidraw/
├── src/                    # 插件主入口和工具函数
│   ├── index.ts           # 插件主逻辑 (ExcalidrawPlugin 类)
│   ├── index.scss         # 插件样式
│   ├── default.json       # 默认占位图像内容
│   └── i18n/              # 国际化文件
├── app/                    # Excalidraw 编辑界面
│   ├── app.tsx            # React 编辑组件
│   ├── app.scss           # 编辑界面样式
│   └── index.html         # 编辑界面入口
├── embed/                  # 嵌入内容
│   ├── siyuan/            # 思源块嵌入界面
│   │   ├── index.html
│   │   └── index.ts
│   └── markdown/          # Markdown 编辑器
│       ├── index.html
│       ├── index.ts
│       ├── utils.ts       # 工具函数（访问父页面 API）
│       └── types.ts       # TypeScript 类型定义
├── plugin.json            # 思源插件配置文件
├── vite.config.ts         # 插件主构建配置
├── vite.app.config.ts     # 编辑界面构建配置
├── vite.embed-siyuan.config.ts  # 思源嵌入界面构建配置
└── vite.embed-markdown.config.ts # Markdown 嵌入界面构建配置
```

## 构建与运行

### 环境准备

1. 安装依赖:
```bash
pnpm install
```

2. 配置思源工作空间路径:
```bash
# 复制环境变量示例文件
cp .env.example .env
# 编辑 .env 文件，设置 VITE_SIYUAN_WORKSPACE_PATH
```

### 开发命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 构建插件并监听变化 (开发模式) |
| `pnpm dev:app` | 构建编辑界面 (开发模式) |
| `pnpm dev:embed-siyuan` | 构建思源嵌入界面 (开发模式) |
| `pnpm dev:embed-markdown` | 构建 Markdown 嵌入界面 (开发模式) |
| `pnpm build` | 完整构建所有模块 |
| `pnpm build:app` | 仅构建编辑界面 |
| `pnpm build:embed-siyuan` | 仅构建思源嵌入界面 |
| `pnpm build:embed-markdown` | 仅构建 Markdown 嵌入界面 |
| `pnpm build:plugin` | 仅构建插件主体 |

## 开发规范

### 代码风格

- **缩进**: 2 空格
- **引号**: 单引号
- **类型系统**: TypeScript (严格模式部分启用)
- **导入顺序**: 使用 `@antfu/eslint-config` 规范

### 项目约定

1. **路径别名**:
   - `@/` 指向 `src/` 目录
   - `@/libs/*` 指向 `src/libs/*` 目录

2. **国际化**: 所有用户可见文本应使用 `this.i18n` 访问，支持中英文

3. **思源插件生命周期**:
   - `onload()`: 插件加载时初始化
   - `onunload()`: 插件卸载时清理
   - `openSetting()`: 打开设置界面

4. **图像存储格式**: 支持 SVG 和 PNG 两种格式，SVG 格式将场景数据嵌入图像元数据中

### 关键功能模块

1. **图像创建**: 通过 `/excalidraw` 命令创建新图像
2. **图像编辑**: 支持 Tab 或 Dialog 两种编辑窗口模式
3. **自动保存**: 可配置自动保存间隔
4. **自定义片段**: 支持加载自定义 CSS/JS 代码片段
5. **嵌入思源块**: 支持在 Excalidraw 中嵌入思源笔记内容
6. **Markdown 编辑器**: 
   - 在 Excalidraw 中嵌入 Vditor Markdown 编辑器
   - 支持所见即所得的编辑体验
   - 通过直接访问父页面 API 实现数据同步

### Markdown 编辑器实现细节

**数据结构**:
```typescript
// 存储在 Excalidraw embeddable 元素的 customData.markdown 中
interface MarkdownData {
  content: string;                        // Markdown 内容
  config: MarkdownConfig;                 // 编辑器配置
}
```

**通信机制**:
- `embed/markdown` 直接访问父页面的 `window.parent.excalidrawAPI`
- 不需要 postMessage 中转，直接调用 API 更新元素数据
- 数据流：`embed/markdown/utils.ts` → `window.parent.excalidrawAPI.updateScene()`

**判断方式**:
```typescript
// 判断是否为 Markdown 元素：检查 customData.markdown 是否存在
if (element?.customData?.markdown) {
  // 这是 Markdown 元素
}
```

### 注意事项

- 插件使用 `process.env.DEV_MODE` 区分开发和生产模式
- 开发模式下会自动监听文件变化并重新加载
- 发布时会自动生成 `package.zip` 文件
- 思源工作空间路径必须正确配置才能在开发模式下使用
