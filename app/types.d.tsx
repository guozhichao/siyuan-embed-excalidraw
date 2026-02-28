
interface Window {
  EXCALIDRAW_ASSET_PATH: string;
  EXCALIDRAW_LIBRARY_PATH: string;
  excalidrawAPI: any;
};

interface IframeCache {
  dataURL: string | null;
  embedIframeVersionNonce: number;
  width: number;
  height: number;
}