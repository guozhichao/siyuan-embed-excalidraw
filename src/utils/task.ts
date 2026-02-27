// --- 类型定义 (如果 TS 报错找不到 IdleDeadline) ---
interface IdleDeadline {
  didTimeout: boolean;
  timeRemaining(): number;
}

interface RequestIdleCallbackOptions {
  timeout?: number;
}

// --- 1. requestIdleCallback Polyfill ---

export function requestIdleCallbackCompat(
  callback: (deadline: IdleDeadline) => void,
  options?: RequestIdleCallbackOptions
): number {
  // 如果浏览器原生支持，直接使用
  if ('requestIdleCallback' in window) {
    return window.requestIdleCallback(callback, options);
  }

  // 降级方案：使用 setTimeout 模拟
  // 缺点：无法检测浏览器是否真的空闲，但能保证功能可用
  const start = Date.now();
  return setTimeout(() => {
    callback({
      didTimeout: false,
      timeRemaining: () => {
        // 模拟剩余时间：强制给 50ms (一帧约 16.6ms，给 50ms 比较安全)
        // 或者根据 timeout 计算
        const elapsed = Date.now() - start;
        const maxTime = options?.timeout || 50;
        return Math.max(0, maxTime - elapsed);
      },
    });
  }, 1) as any;
};

export function cancelIdleCallbackCompat(id: number): void {
  if ('cancelIdleCallback' in window) {
    window.cancelIdleCallback(id);
  } else {
    clearTimeout(id);
  }
};

// --- 2. 基于 requestIdleCallback 的时间切片函数 ---

/**
 * 智能时间切片处理器
 * 只在浏览器空闲时执行任务，避免卡顿 UI
 * 
 * @param items 需要处理的大数组
 * @param processFn 处理单个元素的函数 (支持异步)
 * @param options 配置项
 */
export async function idleTimeSlice<T>(
  items: T[],
  processFn: (item: T, index: number) => void | Promise<void>,
  options: {
    chunkTimeout?: number; // 每个切片最大耗时 (ms)，默认 40ms (留 20ms 给渲染)
    globalTimeout?: number; // 全局超时 (ms)，防止永远不空闲导致任务挂起
  } = {}
): Promise<void> {
  const { chunkTimeout = 40, globalTimeout = 10000 } = options;
  let index = 0;

  return new Promise((resolve, reject) => {
    const runTask = (deadline: IdleDeadline) => {
      // 循环处理，直到时间用完或任务完成
      while (index < items.length) {
        // 检查时间是否用完
        if (deadline.timeRemaining() < chunkTimeout / 4) { 
          // 如果剩余时间少于 10ms (40/4)，停止当前切片，预约下一次
          // 这里留一点缓冲，防止计算超时
          scheduleNext();
          return;
        }

        try {
          // 同步执行处理函数
          // 注意：如果 processFn 是异步的，这里需要特殊处理 (见下方说明)
          const result = processFn(items[index], index);
          
          // 如果 processFn 返回了 Promise，我们需要 await 它
          // 但在 requestIdleCallback 的同步循环中不能直接 await
          // 解决方案：如果是异步任务，立即调度下一个切片，并等待当前 Promise
          if (result instanceof Promise) {
            result.then(() => {
              index++;
              scheduleNext();
            }).catch(reject);
            return; // 退出当前循环，等待 Promise  resolve
          }
          
          index++;
        } catch (error) {
          reject(error);
          return;
        }
      }

      // 所有任务完成
      resolve();
    };

    const scheduleNext = () => {
      if (index >= items.length) {
        resolve();
        return;
      }
      
      // 使用 Polyfill 调度下一次空闲执行
      requestIdleCallbackCompat(runTask, { timeout: globalTimeout });
    };

    // 启动第一个任务
    scheduleNext();
  });
}

export async function processArraySequentially<T, R>(
  items: T[],
  processor: (item: T) => Promise<R> | R,
  onProgress?: (index: number, total: number) => void
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i++) {
    // 1. 执行耗时任务 (这里会卡住 UI，但只卡这一次的时间)
    // 假设单个任务耗时 500ms，用户会看到画面停顿 0.5 秒
    const result = await Promise.resolve(processor(items[i]));
    results.push(result);

    // 2. 【关键】让出主线程，强制浏览器渲染下一帧
    // 这样用户能看到进度条在动，或者 Loading 动画在转
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // 3. 可选：更新进度 UI
    if (onProgress) onProgress(i + 1, items.length);
  }

  return results;
}