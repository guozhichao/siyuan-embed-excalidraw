import { debounce } from 'lodash';
import { createRoot } from 'react-dom/client';
import React from 'react';
import {
  Excalidraw,
  loadFromBlob,
  exportToSvg,
  exportToBlob,
  parseLibraryTokensFromUrl,
  loadLibraryFromBlob,
  mergeLibraryItems,
  serializeLibraryAsJSON,
  MainMenu,
  viewportCoordsToSceneCoords,
} from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import './app.scss';
import {
  unicodeToBase64,
  dataURLToBlob,
  getImageSizeFromBase64,
  addStyle,
  arrayToBase64,
  locatePNGtEXt,
  insertPNGtEXt,
  HTMLToElement,
  blobToArray,
} from '../src/utils';
import { fetchPost } from '../src/utils/fetch';
import { isMac, matchHotKey } from '../src/utils/hotkey';
import defaultImageContent from "../src/default.json";
import { nanoid } from "nanoid";
import {
  captureAllIframes,
  replaceIframesWithImages,
} from './utils/iframeCapture';

addStyle("/stage/protyle/js/katex/katex.min.css", "protyleKatexStyle");

window.EXCALIDRAW_ASSET_PATH = '/plugins/siyuan-embed-excalidraw/app/';
window.EXCALIDRAW_LIBRARY_PATH = '/data/storage/petal/siyuan-embed-excalidraw/library.excalidrawlib';
const urlParams = new URLSearchParams(window.location.search);
const langCode = urlParams.get('lang') || 'en';
const enableAutoSave = urlParams.get('enableAutoSave') === 'true';
const autoSaveInterval = Math.max(parseInt(urlParams.get('autoSaveInterval') || '0') * 1000, 300);
let mimeType = 'image/svg+xml';
let imageURL = '';
const exportPadding = 10;

const postMessage = (message: any) => {
  window.parent?.postMessage(JSON.stringify(message), '*');
};

const getEmbeddableLink = (element: any): string => {
  if (element?.type !== 'embeddable') return '';

  const link = element?.link || '';

  // 处理思源块链接
  if (link?.startsWith('siyuan://blocks/')) {
    const blockID = link.split('siyuan://blocks/')[1];
    return `/plugins/siyuan-embed-excalidraw/embed/siyuan?id=${blockID}`;
  }

  // 处理 Markdown 链接 (通过检查 customData.markdown 是否存在)
  if (element?.type === "embeddable" && element?.customData?.markdown) {
    return `/plugins/siyuan-embed-excalidraw/embed/markdown/?elementId=${element.id}`;
  }

  return link;
}

const renderEmbeddable = (element: any, appState: any): React.JSX.Element | null => {
  const src = getEmbeddableLink(element);
  if (!src) return null;

  return (
    <iframe
      className="excalidraw__embeddable"
      src={src}
      referrerPolicy="no-referrer-when-downgrade"
      title="Excalidraw Embedded Content"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen={true}
      sandbox={`allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-downloads`}
    />
  )
}

const fixImageContent = async (imageDataURL: string): Promise<string> => {
  // 当图像为空时，使用默认的占位图
  const imageSize = getImageSizeFromBase64(imageDataURL);
  if (imageSize && imageSize.width <= 20 && imageSize.height <= 20) {
    if (imageDataURL.startsWith('data:image/svg+xml;base64,')) {
      imageDataURL = defaultImageContent['svg'];
    }
    if (imageDataURL.startsWith('data:image/png;base64,')) {
      imageDataURL = defaultImageContent['png'];
    }
    return imageDataURL;
  }

  return imageDataURL;
}

const triggleToast = (messageType: 'saving' | 'savedone') => {
  if (!window.excalidrawAPI) return;
  let message = '';
  if (messageType == 'savedone') {
    message = langCode.startsWith('zh') ? '保存成功' : 'Saved';
  } else {
    message = langCode.startsWith('zh') ? '保存中...' : 'Saving...';
  }
  window.excalidrawAPI.setToast({
    message: message,
    closable: false,
    duration: 1000,
  });
}

const save = async (eventName: 'save' | 'autosave') => {
  if (!window.excalidrawAPI) return;
  if (!document.hasFocus()) return;

  if (eventName === 'save') triggleToast('saving');

  const elements = window.excalidrawAPI.getSceneElements();
  const files = window.excalidrawAPI.getFiles();

  // ========== 第一步：捕获所有 iframe，得到替换后的 elements ==========
  const iframeSvgMap = await captureAllIframes(elements);
  const { elements: processedElements, files: processedFiles } = replaceIframesWithImages(
    elements,
    iframeSvgMap,
    files
  );

  // ========== 第二步：根据 mimeType 选择分支处理 ==========
  let imageDataURL = '';

  if (mimeType === 'image/svg+xml') {
    // ===== SVG 分支 =====
    
    // a. 导出原始 SVG（包含完整 iframe 渲染）
    const originalSvg = await exportToSvg({
      elements: elements,
      appState: {
        ...window.excalidrawAPI.getAppState(),
        exportWithDarkMode: false,
        exportEmbedScene: true,
        exportBackground: false,
      },
      files: files,
      renderEmbeddables: false,
    });

    // b. 导出处理后 SVG（iframe 已替换为图像）
    const processedSvg = await exportToSvg({
      elements: processedElements,
      appState: {
        ...window.excalidrawAPI.getAppState(),
        exportWithDarkMode: false,
        exportEmbedScene: true,
        exportBackground: false,
      },
      files: processedFiles,
      renderEmbeddables: false,
    });

    // c. 替换 metadata
    const originalMetadata = originalSvg.querySelector('metadata')?.innerHTML;
    const processedMetadataEl = processedSvg.querySelector('metadata');
    if (processedMetadataEl && originalMetadata) {
      processedMetadataEl.innerHTML = originalMetadata;
    }

    // d. 转换为 dataURL
    imageDataURL = `data:${mimeType};base64,${unicodeToBase64(processedSvg.outerHTML)}`;
  } else {
    // ===== PNG 分支 =====
    
    // a. 导出原始 PNG（包含完整 iframe 渲染）
    const originalPngBlob = await exportToBlob({
      elements: elements,
      appState: {
        ...window.excalidrawAPI.getAppState(),
        exportWithDarkMode: false,
        exportEmbedScene: true,
        exportBackground: false,
      },
      files: files,
      mimeType: 'image/png',
      exportPadding: exportPadding,
    });
    const originalBinaryArray = await blobToArray(originalPngBlob);

    // b. 导出处理后 PNG（iframe 已替换为图像）
    const processedPngBlob = await exportToBlob({
      elements: processedElements,
      appState: {
        ...window.excalidrawAPI.getAppState(),
        exportWithDarkMode: false,
        exportEmbedScene: true,
        exportBackground: false,
      },
      files: processedFiles,
      mimeType: 'image/png',
      exportPadding: exportPadding,
    });
    const processedBinaryArray = await blobToArray(processedPngBlob);

    // c. 从原始 PNG 中提取 tEXt 块
    const location = locatePNGtEXt(originalBinaryArray);
    if (location) {
      // d. 插入 tEXt 块到处理后 PNG
      const metadataArray = originalBinaryArray.subarray(
        location.index,
        location.index + location.length
      );
      const finalBinaryArray = insertPNGtEXt(processedBinaryArray, metadataArray);
      const base64String = arrayToBase64(finalBinaryArray);
      imageDataURL = `data:image/png;base64,${base64String}`;
    } else {
      const base64String = arrayToBase64(originalBinaryArray);
      imageDataURL = `data:image/png;base64,${base64String}`;
    }
  }

  imageDataURL = await fixImageContent(imageDataURL);

  // ========== 第三步：保存 ==========
  if (!document.hasFocus()) return; // 当窗口未聚焦时，直接放弃保存，避免窗口里的iframe抖动导致渲染为空白

  const blob = dataURLToBlob(imageDataURL);
  const file = new File([blob], imageURL.split('/').pop()!, { type: blob.type });
  const formData = new FormData();
  formData.append("path", 'data/' + imageURL);
  formData.append("file", file);
  formData.append("isDir", "false");

  fetchPost("/api/file/putFile", formData, () => {
    postMessage({
      event: eventName,
      imageURL: imageURL,
      data: imageDataURL,
    });
  });

  if (eventName === 'save') triggleToast('savedone');
}

const openLink = (element: any, event: CustomEvent<{ nativeEvent: MouseEvent | React.PointerEvent<HTMLCanvasElement>; }>) => {
  event.preventDefault();

  if (!element.link) return;

  const match = element.link.match(/^(element|group)=([^&?#\s]+)$/i);
  if (match) {
    const linktype = match[1].toLowerCase() as 'element' | 'group';
    const value = match[2];

    const sceneElements = window.excalidrawAPI.getSceneElements();
    const targets = sceneElements.filter((element: any) => {
      if (linktype === 'element') {
        return element.id === value;
      } else {
        return element.groupIds?.includes(value);
      }
    });
    if (targets.length > 0) {
      window.excalidrawAPI.scrollToContent(targets, {
        animate: true,
      });
    }
  }
  else {
    window.open(element.link, '_blank');
  }
}

const App = (props: { initialData: any }) => {
  // 300ms 内没有修改才保存
  let lastSaveTime = 0;
  const debouncedSave = React.useCallback(
    debounce(() => {
      let currentTime = Date.now();
      if (currentTime - lastSaveTime > autoSaveInterval) {
        lastSaveTime = currentTime;
        save("autosave");
      }
    }, 300),
    []
  );

  let changeInitStatus = true;
  const handleChange = async (elements: readonly any[], state: any) => {
    if (changeInitStatus) {
      // 忽略初始化导致的第一次变化
      changeInitStatus = false;
      return;
    }
    if (!window.excalidrawAPI) return;

    // 只有启用自动保存时才执行防抖保存
    if (enableAutoSave) {
      debouncedSave();
    }
  };

  let libraryChangeInitStatus = true;
  const handleLibraryChange = async (libraryItems: any) => {
    if (libraryChangeInitStatus) {
      // 忽略初始化导致的第一次变化
      libraryChangeInitStatus = false;
      return;
    }
    await saveLibrary(libraryItems);
  };

  const setExcalidrawAPI = (api: any) => {
    window.excalidrawAPI = api;

    // 通知已准备好
    postMessage({ event: 'ready' });
  };

  return (
    <Excalidraw
      initialData={props.initialData}
      langCode={langCode}
      onChange={handleChange}
      onLibraryChange={handleLibraryChange}
      excalidrawAPI={setExcalidrawAPI}
      validateEmbeddable={true}
      renderEmbeddable={renderEmbeddable}
      generateLinkForSelection={(id: string, type: "element" | "group") => { return `${type}=${id}`; }}
      onLinkOpen={openLink}
      UIOptions={{
        canvasActions: {
          loadScene: true,
          saveToActiveFile: false,
        },
      }}
    >
      <MainMenu>
        <MainMenu.Item
          icon={<svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5651" width="32" height="32"><path d="M921.6 450.133333c-6.4-8.533333-14.933333-12.8-25.6-12.8h-10.666667V341.333333c0-40.533333-34.133333-74.666667-74.666666-74.666666H514.133333c-4.266667 0-6.4-2.133333-8.533333-4.266667l-38.4-66.133333c-12.8-21.333333-38.4-36.266667-64-36.266667H170.666667c-40.533333 0-74.666667 34.133333-74.666667 74.666667v597.333333c0 6.4 2.133333 12.8 6.4 19.2 6.4 8.533333 14.933333 12.8 25.6 12.8h640c12.8 0 25.6-8.533333 29.866667-21.333333l128-362.666667c4.266667-10.666667 2.133333-21.333333-4.266667-29.866667zM170.666667 224h232.533333c4.266667 0 6.4 2.133333 8.533333 4.266667l38.4 66.133333c12.8 21.333333 38.4 36.266667 64 36.266667H810.666667c6.4 0 10.666667 4.266667 10.666666 10.666666v96H256c-12.8 0-25.6 8.533333-29.866667 21.333334l-66.133333 185.6V234.666667c0-6.4 4.266667-10.666667 10.666667-10.666667z m573.866666 576H172.8l104.533333-298.666667h571.733334l-104.533334 298.666667z" fill="#666666" p-id="5652"></path></svg>}
          onSelect={() => { document.querySelector("#root .excalidraw")?.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', code: 'keyO', ctrlKey: !isMac(), metaKey: isMac(), bubbles: true, cancelable: true })) }}
        >{langCode.startsWith('zh') ? '打开' : 'Open'}
        </MainMenu.Item>
        <MainMenu.Item
          icon={<svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="7082" width="32" height="32"><path d="M928 896V314.24c0-8.32-3.488-16.64-9.6-22.72l-187.84-186.24a31.36 31.36 0 0 0-22.4-9.28H672v160c0 52.8-43.2 96-96 96H256c-52.8 0-96-43.2-96-96V96H128c-17.6 0-32 14.4-32 32v768c0 17.6 14.4 32 32 32h64v-288c0-52.8 43.2-96 96-96h448c52.8 0 96 43.2 96 96v288h64c17.632 0 32-14.4 32-32z m-160 32v-288c0-17.6-14.368-32-32-32H288c-17.6 0-32 14.4-32 32v288h512zM224 96v160c0 17.6 14.4 32 32 32h320c17.632 0 32-14.4 32-32V96H224z m739.52 150.08c18.272 17.92 28.48 42.88 28.48 68.16V896c0 52.8-43.2 96-96 96H128c-52.8 0-96-43.2-96-96V128c0-52.8 43.2-96 96-96h580.16c25.632 0 49.632 9.92 67.52 27.84l187.84 186.24zM512 256a32 32 0 0 1-32-32V160a32 32 0 0 1 64 0v64a32 32 0 0 1-32 32z" fill="#404853" p-id="7083"></path></svg>}
          onSelect={() => { save("save"); }}
        >{langCode.startsWith('zh') ? '保存' : 'Save'}
        </MainMenu.Item>
        <MainMenu.DefaultItems.SaveAsImage />
        <MainMenu.DefaultItems.SearchMenu />
        <MainMenu.Item
          icon={<svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5086" width="32" height="32"><path d="M768 640 768 512 448 512 448 384 768 384 768 256 960 448ZM704 576 704 832 384 832 384 1024 0 832 0 0 704 0 704 320 640 320 640 64 128 64 384 192 384 768 640 768 640 576Z" fill="#000000" p-id="5087"></path></svg>}
          onSelect={() => { postMessage({ event: 'exit' }); }}
        >{langCode.startsWith('zh') ? '退出' : 'Exit'}
        </MainMenu.Item>
        {
          urlParams.get('fullscreenBtn') == '1' &&
          <MainMenu.Item
            icon={<svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="6075" width="32" height="32"><path d="M692.705882 24.094118h240.941177c36.141176 0 60.235294 24.094118 60.235294 60.235294s-24.094118 60.235294-60.235294 60.235294h-240.941177c-36.141176 0-60.235294-24.094118-60.235294-60.235294s24.094118-60.235294 60.235294-60.235294z" fill="#1E2330" p-id="6076"></path><path d="M933.647059 24.094118c36.141176 0 60.235294 24.094118 60.235294 60.235294v240.941176c0 36.141176-24.094118 60.235294-60.235294 60.235294s-60.235294-24.094118-60.235294-60.235294v-240.941176c0-36.141176 24.094118-60.235294 60.235294-60.235294z" fill="#1E2330" p-id="6077"></path><path d="M915.576471 96.376471c18.070588 24.094118 18.070588 60.235294 0 84.329411l-246.964706 246.964706c-24.094118 24.094118-60.235294 24.094118-84.329412 0-24.094118-24.094118-24.094118-60.235294 0-84.329412l246.964706-246.964705c24.094118-18.070588 60.235294-18.070588 84.329412 0zM90.352941 867.388235h240.941177c36.141176 0 60.235294 24.094118 60.235294 60.235294s-24.094118 60.235294-60.235294 60.235295H90.352941c-36.141176 0-60.235294-24.094118-60.235294-60.235295s24.094118-60.235294 60.235294-60.235294z" fill="#1E2330" p-id="6078"></path><path d="M90.352941 626.447059c36.141176 0 60.235294 24.094118 60.235294 60.235294v240.941176c0 36.141176-24.094118 60.235294-60.235294 60.235295s-60.235294-24.094118-60.235294-60.235295v-240.941176c0-36.141176 24.094118-60.235294 60.235294-60.235294z" fill="#1E2330" p-id="6079"></path><path d="M102.4 909.552941c-24.094118-24.094118-24.094118-60.235294 0-84.329412l246.964706-246.964705c24.094118-24.094118 60.235294-24.094118 84.329412 0 24.094118 24.094118 24.094118 60.235294 0 84.329411l-246.964706 246.964706c-24.094118 18.070588-60.235294 18.070588-84.329412 0zM90.352941 24.094118h240.941177c36.141176 0 60.235294 24.094118 60.235294 60.235294s-24.094118 60.235294-60.235294 60.235294H90.352941c-36.141176 0-60.235294-24.094118-60.235294-60.235294s24.094118-60.235294 60.235294-60.235294z" fill="#1E2330" p-id="6080"></path><path d="M90.352941 24.094118c36.141176 0 60.235294 24.094118 60.235294 60.235294v240.941176c0 36.141176-24.094118 60.235294-60.235294 60.235294s-60.235294-24.094118-60.235294-60.235294v-240.941176c0-36.141176 24.094118-60.235294 60.235294-60.235294z" fill="#1E2330" p-id="6081"></path><path d="M102.4 96.376471c-18.070588 24.094118-18.070588 60.235294 0 84.329411l246.964706 246.964706c24.094118 24.094118 60.235294 24.094118 84.329412 0 24.094118-24.094118 24.094118-60.235294 0-84.329412L186.729412 96.376471c-24.094118-18.070588-60.235294-18.070588-84.329412 0zM692.705882 867.388235h240.941177c36.141176 0 60.235294 24.094118 60.235294 60.235294s-24.094118 60.235294-60.235294 60.235295h-240.941177c-36.141176 0-60.235294-24.094118-60.235294-60.235295s24.094118-60.235294 60.235294-60.235294z" fill="#1E2330" p-id="6082"></path><path d="M933.647059 626.447059c36.141176 0 60.235294 24.094118 60.235294 60.235294v240.941176c0 36.141176-24.094118 60.235294-60.235294 60.235295s-60.235294-24.094118-60.235294-60.235295v-240.941176c0-36.141176 24.094118-60.235294 60.235294-60.235294z" fill="#1E2330" p-id="6083"></path><path d="M915.576471 909.552941c24.094118-24.094118 24.094118-60.235294 0-84.329412l-246.964706-246.964705c-24.094118-24.094118-60.235294-24.094118-84.329412 0-24.094118 24.094118-24.094118 60.235294 0 84.329411l246.964706 246.964706c24.094118 18.070588 60.235294 18.070588 84.329412 0z" fill="#1E2330" p-id="6084"></path></svg>}
            onSelect={() => { postMessage({ event: 'toggleFullscreen' }); }}
          >{langCode.startsWith('zh') ? '切换全屏' : 'Toggle Fullscreen'}
          </MainMenu.Item>
        }
        <MainMenu.DefaultItems.ToggleTheme />
        <MainMenu.DefaultItems.ChangeCanvasBackground />
        <MainMenu.DefaultItems.ClearCanvas />
      </MainMenu>
    </Excalidraw>
  );
};

const load = async () => {
  imageURL = urlParams.get('imageURL') || '';
  if (!imageURL) return;

  const response = await fetch(`/${imageURL}`, { cache: 'reload' });
  if (!response.ok) return;

  const blob = await response.blob();
  mimeType = blob.type;

  const contents = await loadFromBlob(blob, null, null);
  contents.appState.theme = urlParams.get('dark') == '1' ? 'dark' : 'light';
  createRoot(document.getElementById('root')!).render(React.createElement(App, {
    initialData: {
      elements: contents.elements,
      appState: contents.appState,
      files: contents.files,
      scrollToContent: true,
      libraryItems: await loadLibary(),
    },
  }));
};

const messageHandler = (event: MessageEvent) => {
  if (event.data && event.data.length > 0) {
    try {
      var message = JSON.parse(event.data);
      if (message != null) {
      }
    }
    catch (err) {
      console.error(err);
    }
  }
}

const loadLibary = async () => {
  const response = await fetch('/api/file/getFile', {
    method: 'POST',
    body: JSON.stringify({
      path: window.EXCALIDRAW_LIBRARY_PATH,
    }),
  });
  let libraryItems: any = [];
  try {
    const blob = await response.blob();
    libraryItems = await loadLibraryFromBlob(blob);
  } catch (error) {}
  return libraryItems;
}

const saveLibrary = async (libraryItems: any) => {
  const newLibraryData = serializeLibraryAsJSON(libraryItems);
  const file = new File([newLibraryData], 'library.excalidraw', { type: 'application/json' });
  const formData = new FormData();
  formData.append('path', window.EXCALIDRAW_LIBRARY_PATH);
  formData.append('file', file);
  formData.append('isDir', 'false');
  await fetch('/api/file/putFile', {
    method: 'POST',
    body: formData,
  });
}

const addLibrary = async (libraryUrlTokens: { libraryUrl: string, idToken: string | null }) => {
  let ok = true;
  try {
    const libraryUrl = decodeURIComponent(libraryUrlTokens.libraryUrl);
    let request = await fetch(libraryUrl);
    let blob = await request.blob();
    const addedLibraryItems = await loadLibraryFromBlob(blob, "published");
    const localLibraryItems = await loadLibary();
    const mergedLibraryItems = mergeLibraryItems(localLibraryItems, addedLibraryItems);
    await saveLibrary(mergedLibraryItems);
    console.log('add library success');
  } catch (error) {
    ok = false;
    console.error(error);
    console.log('add library fail');
  }
  document.getElementById('root')!.innerHTML = `<div style="display:flex;justify-content:center;align-items:center;height:100vh;">${ok ? 'Add Library Success' : 'Add Library Fail'}</div>`;
}

const getMarkdownToolButton = () => {
  const html = `
<button data-testid="toolbar-markdown" class="dropdown-menu-item dropdown-menu-item-base">
  <div class="dropdown-menu-item__icon">
    <svg aria-hidden="true" focusable="false" role="img" t="1772027273314" class="" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="7889" width="20" height="20"><path d="M92 192C42.24 192 0 232.128 0 282.016v459.968C0 791.904 42.24 832 92 832h840C981.76 832 1024 791.872 1024 741.984V282.016C1024 232.16 981.76 192 932 192z m0 64h840c16.512 0 28 12.256 28 26.016v459.968c0 13.76-11.52 26.016-28 26.016H92C75.488 768 64 755.744 64 741.984V282.016c0-13.76 11.52-25.984 28-25.984zM160 352v320h96v-212.992l96 127.008 96-127.04V672h96V352h-96l-96 128-96-128z m544 0v160h-96l144 160 144-160h-96v-160z" p-id="7890"></path></svg>
  </div>
  <div class="dropdown-menu-item__text"> Markdown </div>
</button>`.trim();
  const element = HTMLToElement(html);
  element.addEventListener('click', () => {
    const elementID = nanoid();
    const appState = window.excalidrawAPI.getAppState();
    const { x, y } = viewportCoordsToSceneCoords(
      { clientX: appState.width / 2, clientY: appState.height / 2 },
      appState,
    );

    // 创建 Markdown embeddable 元素
    const newElement = {
      id: elementID,
      type: 'embeddable',
      x,
      y,
      width: 400,
      height: 400,
      angle: 0,
      strokeColor: 'transparent',
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: 2,
      strokeStyle: 'solid',
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      index: 'aO',
      roundness: null,
      seed: Math.floor(Math.random() * 10000),
      version: 1,
      versionNonce: Math.floor(Math.random() * 10000),
      isDeleted: false,
      boundElements: [],
      updated: Date.now(),
      link: `markdown`,
      locked: false,
      customData: {
        markdown: {
          content: '',
          config: {
          },
        },
      },
    };

    const sceneElements = window.excalidrawAPI.getSceneElements();
    window.excalidrawAPI.updateScene({ elements: [...sceneElements, newElement] });
  });

  return element;
}

const setupMutationObserver = () => {
  const mutationObserver = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const addedElement = node as HTMLElement;
            addedElement.querySelectorAll(".library-menu-browse-button").forEach(element => {
              element.addEventListener('click', () => {
                postMessage({ event: 'browseLibrary' });
              });
            });
            const lastTool = addedElement.querySelector(".dropdown-menu-item[data-testid='toolbar-laser']");
            if (lastTool) {
              lastTool.insertAdjacentElement('afterend', getMarkdownToolButton());
            }
          }
        });
      }
      else if (mutation.type === 'attributes') {
        if (mutation.attributeName === 'class'
          && mutation.target.nodeType === Node.ELEMENT_NODE
          && (mutation.target as HTMLElement).classList.contains('excalidraw-tooltip--visible')
          && window.frameElement
          && mutation.target.textContent?.startsWith('siyuan://blocks/')
        ) {
          const tooltip = mutation.target as HTMLElement;
          const rect = tooltip.getBoundingClientRect();
          const frameRect = window.frameElement.getBoundingClientRect();
          const blockID = mutation.target.textContent.split('siyuan://blocks/').pop();
          postMessage({
            event: 'triggleHoverBlock',
            blockID: blockID,
            x: frameRect.left + rect.left,
            y: frameRect.top + rect.top,
          });
        }
      }
    }
  });

  mutationObserver.observe(document, {
    childList: true,
    attributes: true,
    attributeFilter: ['class'],
    subtree: true
  });
}

const libraryUrlTokens = parseLibraryTokensFromUrl();
if (libraryUrlTokens) {
  addLibrary(libraryUrlTokens);
} else {
  window.addEventListener('message', messageHandler);
  load();
  postMessage({ event: 'init' });
  setupMutationObserver();
}

window.addEventListener('keydown', (event: KeyboardEvent) => {
  if (matchHotKey('⌘S', event)) {
    event.preventDefault();
    save("save");
  }
});
