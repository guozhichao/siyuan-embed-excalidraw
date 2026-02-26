import { snapdom } from '@zumer/snapdom';

/**
 * 判断元素是否需要 iframe 捕获处理
 * 目前支持：思源块嵌入、Markdown 元素
 */
export function needsIframeCapture(element: any): boolean {
  // Markdown 元素
  if (element?.customData?.markdown) return true;
  
  // 思源块嵌入
  if (element?.link?.startsWith('/plugins/siyuan-embed-excalidraw/embed/siyuan')) return true;
  
  return false;
}

/**
 * 获取 iframe 元素
 */
export function getIframeForElement(element: any): HTMLIFrameElement | null {
  if (element?.customData?.markdown) {
    return document.querySelector(
      `iframe.excalidraw__embeddable[src*="/embed/markdown/?elementId=${element.id}"]`
    ) as HTMLIFrameElement;
  }
  
  if (element?.link?.includes('/embed/siyuan')) {
    const blockId = element.link.split('id=')[1];
    return document.querySelector(
      `iframe.excalidraw__embeddable[src*="/embed/siyuan?id=${blockId}"]`
    ) as HTMLIFrameElement;
  }
  
  return null;
}

/**
 * 捕获 iframe 并转换为 SVG 字符串
 */
export async function captureIframe(
  iframe: HTMLIFrameElement
): Promise<string | null> {
  try {
    if (!iframe.contentDocument?.body) return null;
    const svg = await snapdom.toSvg(iframe.contentDocument.body, {
      width: iframe.clientWidth,
      height: iframe.clientHeight,
      scale: 1,
      embedFonts: true,
    });
    return svg.src;
  } catch (error) {
    console.error('Failed to capture iframe:', error);
    return null;
  }
}

/**
 * 为所有需要处理的元素捕获 iframe
 */
export async function captureAllIframes(
  elements: any[]
): Promise<Map<string, string>> {
  const iframeMap = new Map<string, string>();
  
  const elementsToCapture = elements.filter(needsIframeCapture);
  
  await Promise.all(
    elementsToCapture.map(async (el) => {
      const iframe = getIframeForElement(el);
      if (!iframe) return;
      
      // 等待 iframe 加载
      await new Promise<void>((resolve) => {
        if (iframe.contentDocument?.readyState === 'complete') {
          resolve();
        } else {
          iframe.addEventListener('load', () => resolve(), { once: true });
        }
      });
      
      const svgContent = await captureIframe(iframe);
      if (svgContent) {
        iframeMap.set(el.id, svgContent);
      }
    })
  );
  
  return iframeMap;
}

/**
 * 创建 Excalidraw 文件对象
 */
export function createImageFile(
  elementId: string,
  svgDataURL: string
): { fileId: string; file: any } {
  const fileId = `file-${elementId}-${Date.now()}`;
  
  return {
    fileId,
    file: {
      id: fileId,
      dataURL: svgDataURL,
      mimeType: 'image/svg+xml',
      created: Date.now(),
    },
  };
}

/**
 * 替换元素中的 iframe 为图像
 * 每个 embeddable 元素会被替换成：矩形背景 + SVG 图像
 */
export function replaceIframesWithImages(
  elements: any[],
  iframeSvgMap: Map<string, string>,
  files: any
): { elements: any[]; files: any } {
  const newFiles : any = {};
  
  // 使用 flatMap 将每个元素映射为 1 个或 2 个元素
  const processedElements = elements.flatMap((el) => {    
    const svgDataURL = iframeSvgMap.get(el.id);
    if (!svgDataURL) {
      return [el]; // 没有捕获到 iframe，保持原样
    }
    
    const { fileId, file } = createImageFile(el.id, svgDataURL);
    newFiles[fileId] = file;
    
    // 返回两个元素：矩形背景 + SVG 图像
    return [
      {
        // 矩形背景元素
        id: `${el.id}-rect`,
        type: 'rectangle',
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        angle: el.angle,
        strokeColor: el.strokeColor,
        backgroundColor: el.backgroundColor,
        fillStyle: el.fillStyle,
        strokeWidth: el.strokeWidth,
        strokeStyle: el.strokeStyle,
        roundness: el.roundness,
        opacity: el.opacity,
        groupIds: el.groupIds,
        frameId: el.frameId,
      },
      {
        // SVG 图像元素
        id: `${el.id}-image`,
        type: 'image',
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        angle: el.angle,
        fileId: fileId,
        opacity: el.opacity,
        groupIds: el.groupIds,
        frameId: el.frameId,
      },
    ];
  });
  
  return { elements: processedElements, files: { ...files, ...newFiles} };
}
