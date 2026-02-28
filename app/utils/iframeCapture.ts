import { snapdom } from '@zumer/snapdom';
import { processArraySequentially } from '../../src/utils/task';

/**
 * 判断元素是否需要 iframe 捕获处理
 * 目前支持：思源块嵌入、Markdown 元素
 */
export function needsIframeCapture(element: any): boolean {
  // Markdown 元素
  if (element?.customData?.embedMarkdown) return true;

  // 思源块嵌入
  if (element?.link?.startsWith('/plugins/siyuan-embed-excalidraw/embed/siyuan')) return true;

  return false;
}

/**
 * 获取 iframe 元素
 */
export function getIframeForElement(element: any): HTMLIFrameElement | null {
  if (element?.customData?.embedMarkdown) {
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
    const img = await snapdom.toSvg(iframe.contentDocument.body, {
      width: iframe.clientWidth,
      height: iframe.clientHeight,
      scale: 1,
      embedFonts: true,
    });
    return img.src;
  } catch (error) {
    console.error('Failed to capture iframe:', error);
    return null;
  }
}

/**
 * 为所有需要处理的元素捕获 iframe
 */
export async function captureAllIframes(
  elements: any[],
  iframeCacheMap: Map<string, IframeCache>,
): Promise<Map<string, IframeCache>> {
  const elementsToCapture = elements.filter(needsIframeCapture);
  const newIframeCacheMap = new Map<string, IframeCache>();

  const captureElement = async (element: any) => {
    let cache = iframeCacheMap.get(element.id);
    if (cache
      && cache.dataURL
      && cache.embedIframeVersionNonce === element.customData.embedIframeVersionNonce
      && cache.width === element.width
      && cache.height === element.height
    ) {
      newIframeCacheMap.set(element.id, cache);
      return;
    }
    cache = {
      dataURL: null,
      embedIframeVersionNonce: element.customData?.embedIframeVersionNonce || Math.floor(Math.random() * 10000),
      width: element.width,
      height: element.height,
    } as IframeCache;
    newIframeCacheMap.set(element.id, cache);

    const iframe = getIframeForElement(element);
    if (!iframe) return;

    // 等待 iframe 加载
    await new Promise<void>((resolve) => {
      if (iframe.contentDocument?.readyState === 'complete') {
        resolve();
      } else {
        iframe.addEventListener('load', () => resolve(), { once: true });
      }
    });

    cache.dataURL = await captureIframe(iframe);
    newIframeCacheMap.set(element.id, cache);
  };

  // elementsToCapture.forEach(captureElement);
  // await Promise.all(elementsToCapture.map(captureElement));
  // await idleTimeSlice(elementsToCapture, captureElement, { chunkTimeout: 500, globalTimeout: 10000 });
  await processArraySequentially(elementsToCapture, captureElement);

  return newIframeCacheMap;
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
  iframeCacheMap: Map<string, IframeCache>,
  files: any
): { elements: any[]; files: any } {
  const newFiles: any = {};

  // 使用 flatMap 将每个元素映射为 1 个或 2 个元素
  const processedElements = elements.flatMap((element) => {
    const cache = iframeCacheMap.get(element.id);
    if (!(cache?.dataURL)) {
      return [element]; // 没有捕获到 iframe，保持原样
    }

    const { fileId, file } = createImageFile(element.id, cache.dataURL);
    newFiles[fileId] = file;

    // 返回两个元素：矩形背景 + SVG 图像
    return [
      {
        // 矩形背景元素
        id: `${element.id}-rect`,
        type: 'rectangle',
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        angle: element.angle,
        strokeColor: element.strokeColor,
        backgroundColor: element.backgroundColor,
        fillStyle: element.fillStyle,
        strokeWidth: element.strokeWidth,
        strokeStyle: element.strokeStyle,
        roundness: element.roundness,
        opacity: element.opacity,
        groupIds: element.groupIds,
        frameId: element.frameId,
      },
      {
        // SVG 图像元素
        id: `${element.id}-image`,
        type: 'image',
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        angle: element.angle,
        fileId: fileId,
        opacity: element.opacity,
        groupIds: element.groupIds,
        frameId: element.frameId,
        roundness: element.roundness,
      },
    ];
  });

  return { elements: processedElements, files: { ...files, ...newFiles } };
}

export async function computeHash(str: string): Promise<string> {
  // 1. 将字符串编码为 Uint8Array
  const msgBuffer = new TextEncoder().encode(str);

  // 2. 计算哈希 (返回 ArrayBuffer)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);

  // 3. 将 ArrayBuffer 转换为十六进制字符串
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}

const CACHE_VERSION = 1;
export async function putIframeCacheMap(imageURL: string, iframeCacheMap: Map<string, IframeCache>) {
  const imageHash = await computeHash(imageURL);
  const cacheData = {
    cacheVersion: CACHE_VERSION,
    imageURL: imageURL,
    iframeCacheData: Object.fromEntries(iframeCacheMap),
  }
  const iframeCacheData = JSON.stringify(cacheData);
  const file = new File([iframeCacheData], `cache-${imageHash}.json`, { type: 'application/json' });
  const formData = new FormData();
  formData.append('path', `/temp/siyuan-embed-excalidraw/cache/cache-${imageHash}.json`);
  formData.append('file', file);
  formData.append('isDir', 'false');
  await fetch('/api/file/putFile', {
    method: 'POST',
    body: formData,
  });
}

export async function getIframeCacheMap(imageURL: string): Promise<Map<string, IframeCache>> {
  const imageHash = await computeHash(imageURL);
  const response = await fetch('/api/file/getFile', {
    method: 'POST',
    body: JSON.stringify({
      path: `/temp/siyuan-embed-excalidraw/cache/cache-${imageHash}.json`,
    }),
  });
  if (response.ok && response.status === 200) {
    const iframeCacheData = await response.json();
    if (iframeCacheData.cacheVersion === CACHE_VERSION && iframeCacheData.iframeCacheData) {
      return new Map<string, IframeCache>(Object.entries(iframeCacheData.iframeCacheData));
    }
  }
  return new Map<string, IframeCache>();
}