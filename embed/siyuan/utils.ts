import { SiyuanBlockData } from "./types";

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

export async function getElementData(elementId: string, blockId: string): Promise<SiyuanBlockData | null> {
  const api = getParentExcalidrawAPI();
  if (!api) return null;

  const element = api.getSceneElements().find((el : any) => el.id === elementId);
  if (element) {
    const content = await fetchBlockMarkdown(blockId);
    if (content === null) {
      if (element.customData?.embedSiyuan) {
        const elements = api.getSceneElements().map((element: any) => {
          if (element.id === elementId && element.customData) {
            element.customData.embedSiyuan = undefined;
            element.customData.embedIframeVersionNonce = undefined;
          }
          return element;
        })
        api.updateScene({ elements: elements });
      }
      return null;
    }

    const data: SiyuanBlockData = {
      blockId: blockId,
      content: OptimizeMarkdown(content),
      config: {},
    };

    if (element.customData?.embedSiyuan) data.config = element.customData.embedSiyuan.config;

    if (!element.customData?.embedSiyuan || element.customData.embedSiyuan.blockId !== data.blockId || element.customData.embedSiyuan.content !== data.content) {
      const elements = api.getSceneElements().map((element: any) => {
        if (element.id === elementId) {
          if (!element.customData) element.customData = {}
          element.customData.embedSiyuan = data;
          element.customData.embedIframeVersionNonce =  Math.floor(Math.random() * 10000);
          return element;
        }
      })
      api.updateScene({ elements: elements });
    }

    return data;
  }
  return null;
}

/**
 * 更新父页面的元素数据
 */
export function updateElementData(elementId: string, blockData: SiyuanBlockData): void {
  const api = getParentExcalidrawAPI();
  if (!api) return;

  const elements = api.getSceneElements().map((element: any) => {
    if (element.id === elementId) {
      if (!element.customData) element.customData = {};
      element.customData.embedIframeVersionNonce = Math.floor(Math.random() * 10000);
      element.version = element.version + 1;
      element.versionNonce = Math.floor(Math.random() * 10000);
      element.updated = Date.now();
    }
    return element;
  });
  api.updateScene({
    elements: elements,
  });
}

/**
 * 从思源 API 获取块 Markdown 内容
 */
async function fetchBlockMarkdown(blockId: string): Promise<string | null> {
  try {
    const response = await fetch('/api/export/exportMdContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: blockId,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (result.code === 0 && result.data) {
      return result.data.content;
    }
    console.error('Failed to fetch block markdown:', result.msg);
    return null;
  } catch (error) {
    console.error('Error fetching block markdown:', error);
    return null;
  }
}

function OptimizeMarkdown(markdown: string): string {
  // 去掉frontmatter
  const frontMatterRegex = /^---[\s\S]*?\n---\n?/;
  if (frontMatterRegex.test(markdown)) {
    markdown = markdown.replace(frontMatterRegex, '').trim();
  }
  // 去掉文件名标题
  if (markdown.startsWith('# ')) {
    markdown = markdown.replace(/^# [^\n]*\n?/, '').trim();
  }
  // 修复所有附件链接
  markdown = markdown.replace(/(\[.*?\])\(assets\/([^)]*)\)/g, '$1(/assets/$2)');
  return markdown;
}