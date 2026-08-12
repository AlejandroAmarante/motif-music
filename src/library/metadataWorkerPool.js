const DEFAULT_MAX_WORKERS = 4;
const DEFAULT_MIN_WORKERS = 2;

function getWorkerCount() {
  const cores =
    typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;

  /*
   * Leave at least one logical core available for the main thread.
   *
   * Examples:
   * 2 cores -> 2 workers
   * 4 cores -> 3 workers
   * 8 cores -> 4 workers
   */
  return Math.max(
    DEFAULT_MIN_WORKERS,
    Math.min(DEFAULT_MAX_WORKERS, Math.max(2, cores - 1)),
  );
}

function createWorker() {
  return new Worker(new URL("./metadataWorker.js", import.meta.url), {
    type: "module",
  });
}

let nextJobId = 1;

class MetadataWorkerPool {
  constructor(workerCount = getWorkerCount()) {
    this.workerCount = workerCount;

    this.workers = [];

    this.queue = [];

    this.destroyed = false;

    for (let i = 0; i < workerCount; i += 1) {
      this.addWorker();
    }
  }

  addWorker() {
    const slot = {
      worker: null,
      busy: false,
      job: null,
    };

    slot.worker = createWorker();

    slot.worker.onmessage = (event) => {
      this.handleMessage(slot, event.data);
    };

    slot.worker.onerror = (event) => {
      this.handleWorkerError(
        slot,
        event.error || new Error(event.message || "Metadata worker failed"),
      );
    };

    slot.worker.onmessageerror = () => {
      this.handleWorkerError(
        slot,
        new Error("Metadata worker message could not be deserialized"),
      );
    };

    this.workers.push(slot);
  }

  handleMessage(slot, message) {
    if (message?.type !== "result") {
      return;
    }

    const job = slot.job;

    if (!job) {
      return;
    }

    if (message.jobId !== job.id) {
      return;
    }

    slot.busy = false;
    slot.job = null;

    if (message.ok) {
      job.resolve({
        tags: message.tags,
        parseMs: message.parseMs ?? null,
      });
    } else {
      /*
       * Parsing failure is still a valid result. The worker has already
       * supplied the normalized empty metadata shape.
       */
      job.resolve({
        tags: message.tags,
        parseMs: message.parseMs ?? null,
        error: message.error || null,
      });
    }

    this.pump();
  }

  handleWorkerError(slot, error) {
    const job = slot.job;

    slot.busy = false;
    slot.job = null;

    if (job) {
      job.reject(error);
    }

    /*
     * Remove the failed worker and replace it so one crashed parser does
     * not permanently reduce scan concurrency.
     */
    const index = this.workers.indexOf(slot);

    if (index !== -1) {
      this.workers.splice(index, 1);
    }

    try {
      slot.worker.terminate();
    } catch {
      // Worker may already be dead.
    }

    if (!this.destroyed) {
      this.addWorker();
      this.pump();
    }
  }

  pump() {
    if (this.destroyed) {
      return;
    }

    for (const slot of this.workers) {
      if (slot.busy || this.queue.length === 0) {
        continue;
      }

      const job = this.queue.shift();

      slot.busy = true;
      slot.job = job;

      try {
        slot.worker.postMessage({
          jobId: job.id,
          file: job.file,
        });
      } catch (err) {
        slot.busy = false;
        slot.job = null;

        job.reject(err);
      }
    }
  }

  parse(file) {
    if (this.destroyed) {
      return Promise.reject(
        new Error("Metadata worker pool has been destroyed"),
      );
    }

    return new Promise((resolve, reject) => {
      this.queue.push({
        id: nextJobId++,
        file,
        resolve,
        reject,
      });

      this.pump();
    });
  }

  destroy() {
    this.destroyed = true;

    for (const job of this.queue) {
      job.reject(new Error("Metadata worker pool destroyed"));
    }

    this.queue = [];

    for (const slot of this.workers) {
      if (slot.job) {
        slot.job.reject(new Error("Metadata worker pool destroyed"));
      }

      try {
        slot.worker.terminate();
      } catch {
        // Ignore termination errors.
      }
    }

    this.workers = [];
  }
}

let sharedPool = null;

/**
 * Returns the application-wide metadata worker pool.
 *
 * The workers are created lazily, so simply importing this module does not
 * immediately spawn several background threads.
 */
export function getMetadataWorkerPool() {
  if (!sharedPool) {
    sharedPool = new MetadataWorkerPool();
  }

  return sharedPool;
}

/**
 * Convenience wrapper used by metadataParser.js.
 */
export function parseMetadataInWorker(file) {
  return getMetadataWorkerPool().parse(file);
}

/**
 * Primarily useful during development/tests or when the application is being
 * completely torn down.
 */
export function destroyMetadataWorkerPool() {
  if (!sharedPool) {
    return;
  }

  sharedPool.destroy();
  sharedPool = null;
}
