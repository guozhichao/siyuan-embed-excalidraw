/**
 * Markdown 编辑器的数据结构定义
 */

/**
 * Markdown 编辑器配置
 */
export interface MarkdownConfig {
}

/**
 * Markdown 数据，存储在 Excalidraw embeddable 元素的 customData.markdown 中
 */
export interface MarkdownData {
  /** 编辑器内容 (Markdown 格式) */
  content: string;
  /** 编辑器配置 */
  config: MarkdownConfig;
}
