import type { MarkdownData, } from './types';

/**
 * 获取父页面的 window 对象
 */
export function getParentWindow(): Window | null {
  return window.parent !== window ? window.parent : null;
}

/**
 * 获取父页面的 excalidraw API
 */
export function getParentExcalidrawAPI(): any {
  const parentWindow = getParentWindow();
  if (parentWindow && (parentWindow as any).excalidrawAPI) {
    return (parentWindow as any).excalidrawAPI;
  }
  return null;
}

/**
 * 从父页面获取元素数据
 */
export function getElementData(elementId: string): MarkdownData | null {
  const api = getParentExcalidrawAPI();
  if (!api) return null;
  
  try {
    const element = api.getSceneElements().find((el : any) => el.id === elementId);
    if (element && element.customData?.markdown) {
      return element.customData.markdown as MarkdownData;
    }
  } catch (error) {
    console.error('Failed to get element data:', error);
  }
  return null;
}

/**
 * 更新父页面的元素数据
 */
export function updateElementData(elementId: string, markdownData: MarkdownData): void {
  const api = getParentExcalidrawAPI();
  if (!api) return;
  
  try {
    const elements = api.getSceneElements().map((element: any) => {
      if (element.id === elementId) {
        element.customData.markdown = markdownData;
        element.customData.iframeVersionNonce = Math.floor(Math.random() * 10000);
        element.version = element.version + 1;
        element.versionNonce = Math.floor(Math.random() * 10000);
        element.updated = Date.now();
      }
      return element;
    });
    api.updateScene({
      elements: elements,
    });
  } catch (error) {
    console.error('Failed to update element data:', error);
  }
}

