export class Time {
  public current: number = 0;
  public delta: number = 0;
  public elapsed: number = 0;

  // Time scale for slow motion effects
  public scale: number = 1.0;

  constructor() {
    this.current = performance.now();
  }

  public update(): void {
    const now = performance.now();
    // Convert MS to Seconds
    let delta = (now - this.current) / 1000;

    // Cap delta to prevent huge jumps if the tab is inactive
    if (delta > 0.1) {
      delta = 0.1;
    }

    this.delta = delta * this.scale;
    this.elapsed += this.delta;
    this.current = now;
  }
}
