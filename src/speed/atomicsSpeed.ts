import { benchmarkRecord, WorkerIndices, WorkerState } from "../utils";

type AtomicsWorker = { worker: Worker; state: Int32Array; values: Float64Array };

export class AtomicsSpeed {
	#workers: Array<AtomicsWorker> = [];

	constructor() {}

	async init(workers = 1) {
		const promises: Promise<void>[] = [];
		for (let w = 0; w < workers; w++) {
			const p = new Promise<void>((resolve) => {
				const worker = new Worker(new URL("./atomicsSpeedWorker.ts", import.meta.url));
				const state = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2));
				const values = new Float64Array(new SharedArrayBuffer(Float64Array.BYTES_PER_ELEMENT * 3));
				for (let x = 0; x < state.length; x++) {
					Atomics.store(state, x, WorkerState.WAIT);
				}
				this.#workers.push({ worker, state, values });

				worker.addEventListener(
					"message",
					() => {
						// worker.addEventListener("message", this.#workerMessage);
						resolve();
					},
					{ once: true }
				);
				worker.postMessage({ state: state.buffer, values: values.buffer });
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
						const messageResponse = (stopTime: number) => {
							//stopTime = performance.now(); // slower because of promise microtasks
							const timeOriginDiff = w.values[2] - performance.timeOrigin;
							const workerReceivedNormalized = w.values[0] + timeOriginDiff; // worker performance.now() normalizd to Main Thread
							const workerSentNormalized = w.values[1] + timeOriginDiff; // worker performance.now() normalizd to Main Thread
							const workerCalcTime = w.values[1] - w.values[0];

							const resultsSlot = meta[r][i];
							resultsSlot.workerIdx = this.#workers.indexOf(w);
							resultsSlot.roundtrip = stopTime - startTime - workerCalcTime;
							resultsSlot.toWorker = workerReceivedNormalized - startTime;
							resultsSlot.fromWorker = stopTime - workerSentNormalized;
							resolveMsg();
						};
						//
						Atomics.store(w.state, WorkerIndices.MAIN_INDEX, WorkerState.WAIT);
						this.#waitAsync(w).then(messageResponse);
						const startTime = performance.now();
						Atomics.store(w.state, WorkerIndices.WORKER_INDEX, WorkerState.WAKE_UP);
						Atomics.notify(w.state, WorkerIndices.WORKER_INDEX);
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
