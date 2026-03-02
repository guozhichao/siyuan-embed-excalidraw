/**
 * 思源块嵌入的数据结构定义
 */

/**
 * 思源块配置
 */
export interface SiyuanBlockConfig {
}

/**
 * 思源块数据，存储在 Excalidraw embeddable 元素的 customData.embedSiYuanBlock 中
 */
export interface SiyuanBlockData {
  /** 思源块 ID */
  blockId: string;
  /** 渲染的 Markdown 内容 */
  content: string;
  /** 编辑器配置 */
  config: SiyuanBlockConfig;
}
