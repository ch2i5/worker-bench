import { benchmarkRecord } from "../utils";

export class PostMessageSpeed {
	#workers: Array<Worker> = [];

	constructor() {}

	async init(workers = 1) {
		const promises: Promise<void>[] = [];
		for (let w = 0; w < workers; w++) {
			const p = new Promise<void>((resolve) => {
				const worker = new Worker(new URL("./postMessageSpeedWorker.ts", import.meta.url));
				this.#workers.push(worker);
				worker.addEventListener(
					"message",
					() => {
						// worker.addEventListener("message", this.#workerMessage);
						resolve();
					},
					{ once: true }
				);
				worker.postMessage("");
			});
			promises.push(p);
		}

		return new Promise<void>((resolve) => {
			Promise.all(promises).then(() => {
				resolve();
			});
		});
	}

	async benchmark(meta: benchmarkRecord[][], randomDispatch: boolean, runs: number) {
		const promises: Promise<void>[] = [];

		const shuffledWorkers = this.#workers.slice();
		if (randomDispatch) {
			for (let i = shuffledWorkers.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[shuffledWorkers[i], shuffledWorkers[j]] = [shuffledWorkers[j], shuffledWorkers[i]];
			}
		}
		for (let i = 0; i < shuffledWorkers.length; i++) {
			const w = shuffledWorkers[i];

			const p = new Promise<void>(async (res) => {
				for (let r = 0; r < runs; r++) {
					await new Promise<void>((resolveMsg) => {
						w.addEventListener(
							"message",
							(m: MessageEvent) => {
								const data = m.data; // access data memory and force implcit deserialization
								const stopTime = performance.now();
								//
								const timeOriginDiff = data.workerTimeOrigin - performance.timeOrigin;
								const workerReceivedNormalized = data.messageReceivedTime + timeOriginDiff; // worker performance.now() normalizd to Main Thread
								const workerSentNormalized = data.messageSentTime + timeOriginDiff; // worker performance.now() normalizd to Main Thread
								const workerCalcTime = data.messageSentTime - data.messageReceivedTime;

								const resultsSlot = meta[r][i];
								resultsSlot.workerIdx = this.#workers.indexOf(w);
								resultsSlot.roundtrip = stopTime - startTime - workerCalcTime;
								resultsSlot.toWorker = workerReceivedNormalized - startTime;
								resultsSlot.fromWorker = stopTime - workerSentNormalized;

								resolveMsg();
							},
							{ once: true }
						);
						const startTime = performance.now();
						w.postMessage({ startTime: startTime, mainTimeOrigin: performance.timeOrigin });
					});
				}
				res();
			});
			promises.push(p);
		}
		return new Promise<void>((resolve) => {
			Promise.all(promises).then(() => {
				resolve();
			});
		});
	}

	async teardown() {
		const promises: Promise<void>[] = [];
		for (const w of this.#workers) {
			const p = new Promise<void>((resolve) => {
				w.terminate();
				resolve();
			});
			promises.push(p);
		}
		this.#workers.splice(0, this.#workers.length);
		return new Promise<void>((resolve) => {
			Promise.all(promises).then(() => {
				resolve();
			});
		});
	}
}
