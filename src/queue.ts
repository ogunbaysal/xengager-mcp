export class PageQueue {
  private queue: Array<() => void> = [];
  private busy = false;

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.busy) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.busy = true;
    try {
      return await fn();
    } finally {
      const next = this.queue.shift();
      if (next) next();
      else this.busy = false;
    }
  }
}
