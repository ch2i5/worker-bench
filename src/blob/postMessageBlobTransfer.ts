// Transfer ArrayBuffer Memory handle

// const newData = randomKey(Math.max(byteLength, 0));
// 	const dataBuffer = encoder.encode(newData).buffer;

// structuredClone();

import { benchmarkRecord, randomKey } from "../utils";

export class PostMessageBlobTransfer {
	#workers: Array<Worker> = [];
	#encoder = new TextEncoder();

	constructor() {}

	async init(workers = 1) {
		const promises: Promise<void>[] = [];
		for (let w = 0; w < workers; w++) {
			const p = new Promise<void>((resolve) => {
				const worker = new Worker(new URL("./postMessageBlobTransferWorker.ts", import.meta.url));
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

	async benchmark(meta: benchmarkRecord[], randomDispatch: boolean, byteLength: number) {
		const promises: Promise<void>[] = [];
		const payloads: Uint8Array[] = [];

		const shuffledWorkers = this.#workers.slice();
		if (randomDispatch) {
			for (let i = shuffledWorkers.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[shuffledWorkers[i], shuffledWorkers[j]] = [shuffledWorkers[j], shuffledWorkers[i]];
			}
		}
		for (let i = 0; i < this.#workers.length; i++) {
			const content = randomKey(byteLength);
			const data = this.#encoder.encode(content);
			payloads.push(data);
		}
		for (let i = 0; i < shuffledWorkers.length; i++) {
			const w = shuffledWorkers[i];
			let resolver: Function;
			const p = new Promise<void>((res) => {
				resolver = res;
			});
			promises.push(p);
			//
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

					meta[i].workerIdx = this.#workers.indexOf(w);
					meta[i].roundtrip = stopTime - startTime - workerCalcTime;
					meta[i].toWorker = workerReceivedNormalized - startTime;
					meta[i].fromWorker = stopTime - workerSentNormalized;
					resolver();
				},
				{ once: true }
			);
			//
			const payload = payloads[i];
			const msg = { array: payload.buffer };
			const startTime = performance.now();
			w.postMessage(msg, [payload.buffer]);
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
