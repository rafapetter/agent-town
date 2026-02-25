export class Engine {
  private running = false;
  private lastTime = 0;
  private frameId = 0;

  onUpdate: ((dt: number) => void) | null = null;
  onRender: (() => void) | null = null;

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.loop();
  }

  stop(): void {
    this.running = false;
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = 0;
    }
  }

  private loop = (): void => {
    if (!this.running) return;
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    this.onUpdate?.(dt);
    this.onRender?.();
    this.frameId = requestAnimationFrame(this.loop);
  };
}
