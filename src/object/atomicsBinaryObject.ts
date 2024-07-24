// Object as Bytes String via Atomics (copyBuffer on Shared Memory Location)

import { WorkerIndices, WorkerState, benchmarkRecord, generateStringObject } from "../utils";

type AtomicsWorker = { worker: Worker; state: Int32Array; values: Float64Array; data: Uint8Array };

export class AtomicsBinaryObject {
	#workers: Array<AtomicsWorker> = [];
	#encoder = new TextEncoder();

	constructor() {}

	async init(bufferLength: number, workers = 1) {
		const promises: Promise<void>[] = [];
		for (let w = 0; w < workers; w++) {
			const p = new Promise<void>((resolve) => {
				const worker = new Worker(new URL("./atomicsBinaryObjectWorker.ts", import.meta.url));
				const state = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2));
				const values = new Float64Array(new SharedArrayBuffer(Float64Array.BYTES_PER_ELEMENT * 6));
				const data = new Uint8Array(new SharedArrayBuffer(Uint8Array.BYTES_PER_ELEMENT * bufferLength));
				for (let x = 0; x < state.length; x++) {
					Atomics.store(state, x, WorkerState.WAIT);
				}
				this.#workers.push({ worker, state, values, data });

				worker.addEventListener(
					"message",
					() => {
						// worker.addEventListener("message", this.#workerMessage);
						resolve();
					},
					{ once: true }
				);
				worker.postMessage({ state: state.buffer, values: values.buffer, data: data.buffer });
			});
			promises.push(p);
		}

		return new Promise<void>((resolve) => {
			Promise.all(promises).then(() => {
				resolve();
			});
		});
	}

	async benchmark(meta: benchmarkRecord[], randomDispatch: boolean, breadth: number, depth: number, byteLength: number) {
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
			const content = JSON.stringify(generateStringObject(breadth, depth, byteLength));
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
			const messageResponse = (stopTime: number) => {
				//stopTime = performance.now(); // slower because of promise microtasks
				const timeOriginDiff = w.values[2] - performance.timeOrigin;
				const workerReceivedNormalized = w.values[0] + timeOriginDiff; // worker performance.now() normalizd to Main Thread
				const workerSentNormalized = w.values[1] + timeOriginDiff; // worker performance.now() normalizd to Main Thread
				const workerCalcTime = w.values[1] - w.values[0];

				meta[i].workerIdx = this.#workers.indexOf(w);
				meta[i].roundtrip = stopTime - startTime - workerCalcTime;
				meta[i].toWorker = workerReceivedNormalized - startTime;
				meta[i].fromWorker = stopTime - workerSentNormalized;
				resolver();
			};
			//
			w.values[3] = breadth;
			w.values[4] = depth;
			w.values[5] = byteLength;
			const payload = payloads[i];
			w.data.set(payload);
			//
			Atomics.store(w.state, WorkerIndices.MAIN_INDEX, WorkerState.WAIT);
			this.#waitAsync(w).then(messageResponse);
			const startTime = performance.now();
			Atomics.store(w.state, WorkerIndices.WORKER_INDEX, WorkerState.WAKE_UP);
			Atomics.notify(w.state, WorkerIndices.WORKER_INDEX);
		}
		return new Promise<void>((resolve) => {
			Promise.all(promises).then(() => {
				resolve();
			});
		});
	}

	#waitAsync(w: AtomicsWorker) {
		return new Promise<number>((resolve, reject) => {
			const result = Atomics.waitAsync(w.state, WorkerIndices.MAIN_INDEX, WorkerState.WAIT, undefined);
			if (result.async === true) {
				result.value.then((response) => {
					const stopTime = performance.now();
					switch (response) {
						case "ok":
							resolve(stopTime);
							break;
						case "timed-out":
							console.error("timed-out");
							reject();
							break;
					}
				});
			} else {
				console.error(`${result.value}: ${w.state[WorkerIndices.MAIN_INDEX]}`);
				reject();
			}
		});
	}

	async teardown() {
		const promises: Promise<void>[] = [];
		for (const w of this.#workers) {
			const p = new Promise<void>((resolve) => {
				Atomics.store(w.state, WorkerIndices.WORKER_INDEX, WorkerState.TERMINATE);
				Atomics.notify(w.state, WorkerIndices.WORKER_INDEX);
				w.worker.terminate();
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
