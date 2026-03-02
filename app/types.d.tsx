
interface Window {
  EXCALIDRAW_ASSET_PATH: string;
  EXCALIDRAW_LIBRARY_PATH: string;
  excalidrawAPI: any;
  triggleHoverBlock: (blockId: string, location: { x: number, y: number }) => void;
};

interface IframeCache {
  dataURL: string | null;
  embedIframeVersionNonce: number;
  width: number;
  height: number;
}