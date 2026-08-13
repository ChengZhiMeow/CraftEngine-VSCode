import { Messages } from "../messages.js";

// 连续请求合并为一次队列处理, 调用方等待最新结果
export class RebuildCoordinator<T> {
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<T> | undefined;
  private queued = false;
  private disposed = false;

  public constructor(
    private readonly build: () => Promise<T>,
    private readonly reportFailure: (error: unknown) => void,
  ) {}

  public schedule(delay = 180): void {
    if (this.disposed) return;
    this.cancelScheduled();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.rebuild().catch(this.reportFailure);
    }, delay);
  }

  public rebuild(): Promise<T> {
    if (this.disposed)
      return Promise.reject(
        new Error(Messages.src.workspace.rebuildCoordinator.text0001),
      );
    this.queued = true;
    this.running ??= this.drain();
    return this.running;
  }

  public async rebuildFromScratch(reset: () => void): Promise<T> {
    this.cancelScheduled();
    await this.running?.catch(() => undefined);
    this.cancelScheduled();
    this.queued = false;
    reset();
    return this.rebuild();
  }

  public dispose(): void {
    this.disposed = true;
    this.queued = false;
    this.cancelScheduled();
  }

  private cancelScheduled(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  private async drain(): Promise<T> {
    try {
      let result!: T;
      do {
        this.queued = false;
        result = await this.build();
      } while (this.queued && !this.disposed);
      return result;
    } finally {
      this.running = undefined;
    }
  }
}
