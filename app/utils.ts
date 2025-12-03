import html2canvas from 'html2canvas';

export function addRoundedCornersToCanvas(sourceCanvas: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  const sourceCtx = sourceCanvas.getContext('2d');
  if (!sourceCtx) return sourceCanvas; // 确保获取到 2D 绘图上下文

  const targetCanvas = document.createElement('canvas');
  const targetCtx = targetCanvas.getContext('2d');
  if (!targetCtx) return sourceCanvas;

  // 设置目标 canvas 尺寸与源 canvas 相同
  targetCanvas.width = sourceCanvas.width;
  targetCanvas.height = sourceCanvas.height;

  // 首先将源 canvas 绘制到目标 canvas 上
  targetCtx.drawImage(sourceCanvas, 0, 0);

  // 改变 globalCompositeOperation 属性
  targetCtx.globalCompositeOperation = 'destination-in';

  // 在目标 canvas 上绘制圆角矩形路径
  targetCtx.beginPath();
  targetCtx.moveTo(radius, 0);
  targetCtx.lineTo(targetCanvas.width - radius, 0);
  targetCtx.quadraticCurveTo(targetCanvas.width, 0, targetCanvas.width, radius);
  targetCtx.lineTo(targetCanvas.width, targetCanvas.height - radius);
  targetCtx.quadraticCurveTo(targetCanvas.width, targetCanvas.height, targetCanvas.width - radius, targetCanvas.height);
  targetCtx.lineTo(radius, targetCanvas.height);
  targetCtx.quadraticCurveTo(0, targetCanvas.height, 0, targetCanvas.height - radius);
  targetCtx.lineTo(0, radius);
  targetCtx.quadraticCurveTo(0, 0, radius, 0);
  targetCtx.closePath();

  // 填充路径，只有圆角内的图像会被保留下来
  targetCtx.fill();

  // 返回带有圆角的目标 canvas 或者使用 toDataURL() 导出为图片
  return targetCanvas;
}

export function createCanvasFromDataURL(dataURL: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    // 创建一个新的Image实例
    const img = new Image();

    // 设置图像的source为传入的数据URL
    img.src = dataURL;

    // 当图像加载失败时调用reject
    img.onerror = () => reject(new Error('图像加载失败'));

    // 创建canvas元素
    const canvas: HTMLCanvasElement = document.createElement('canvas');
    const ctx: CanvasRenderingContext2D | null = canvas.getContext('2d');

    // 确保获取到了2D绘图上下文
    if (!ctx) {
      return reject(new Error('无法获取2D绘图上下文'));
    }

    // 当图像加载完成后，调整canvas大小，并在canvas上绘制图像
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      resolve(canvas); // 加载成功，解决Promise
    };
  });
}

export async function createCanvasFromIframe(iframe: HTMLIFrameElement, scale: number = 1, padding: number = 0): Promise<HTMLCanvasElement | null> {
  let iframeBody;
  let iframeScrollX;
  let iframeScrollY;
  if (iframe.getAttribute('src')?.startsWith('/plugins/siyuan-embed-excalidraw/embed/siyuan')) {
    const coreIframe = iframe.contentDocument?.querySelector('#root iframe') as HTMLIFrameElement;
    if (coreIframe) {
      iframeBody = coreIframe.contentDocument?.body;
      iframeScrollX = coreIframe.contentDocument?.documentElement.scrollLeft;
      iframeScrollY = coreIframe.contentDocument?.documentElement.scrollTop;
    }
  }
  else {
    iframeBody = iframe.contentDocument?.body;
    iframeScrollX = iframe.contentDocument?.documentElement.scrollLeft;
    iframeScrollY = iframe.contentDocument?.documentElement.scrollTop;
  }
  if (!iframeBody) return null;

  const iframeStyle = window.getComputedStyle(iframe);

  let iframeCanvas = await html2canvas(iframeBody, {
    allowTaint: true,
    useCORS: true,
    logging: false,
    width: parseInt(iframeStyle.width) - 2 * padding || undefined,
    height: parseInt(iframeStyle.height) - 2 * padding || undefined,
    x: iframeScrollX,
    y: iframeScrollY,
    scale: scale,
  });
  const raidus = parseInt(iframeStyle.borderRadius || '');
  if (raidus) {
    iframeCanvas = addRoundedCornersToCanvas(iframeCanvas, scale * raidus);
  }

  return iframeCanvas;
}

export function drawCanvasOnCanvas(targetCanvas: HTMLCanvasElement, sourceCanvas: HTMLCanvasElement, x: number, y: number, angle: number) {
  const ctx = targetCanvas.getContext('2d');
  if (!ctx) return;

  // 保存当前状态
  ctx.save();

  // 计算sourceCanvas的中心点相对于左上角的位置
  const centerX = sourceCanvas.width / 2;
  const centerY = sourceCanvas.height / 2;

  // 移动画布的原点到目标坐标(x, y)，然后平移到sourceCanvas的中心
  ctx.translate(x + centerX, y + centerY);

  // 旋转画布
  ctx.rotate(angle);

  // 绘制sourceCanvas，现在它的中心点位于新原点(0, 0)，所以需要向左和向上平移它的宽和高的一半来补偿
  ctx.drawImage(sourceCanvas, -centerX, -centerY);

  // 恢复之前保存的状态（清除旋转和平移）
  ctx.restore();
}