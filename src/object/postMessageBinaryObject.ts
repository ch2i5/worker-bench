// Object as String Encoded Bytes via PostMessage
import { benchmarkRecord, generateStringObject } from "../utils";

export class PostMessageBinaryObject {
	#workers: Array<Worker> = [];
	#encoder = new TextEncoder();

	constructor() {}

	async init(workers = 1) {
		const promises: Promise<void>[] = [];
		for (let w = 0; w < workers; w++) {
			const p = new Promise<void>((resolve) => {
				const worker = new Worker(new URL("./postMessageBinaryObjectWorker.ts", import.meta.url));
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

	async benchmark(meta: benchmarkRecord[], randomDispatch: boolean, breadth: number, depth: number, byteLength: number) {
		const promises: Promise<void>[] = [];
		const payloads: string[] = [];

		const shuffledWorkers = this.#workers.slice();
		if (randomDispatch) {
			for (let i = shuffledWorkers.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1));
				[shuffledWorkers[i], shuffledWorkers[j]] = [shuffledWorkers[j], shuffledWorkers[i]];
			}
		}
		for (let i = 0; i < this.#workers.length; i++) {
			const data = JSON.stringify(generateStringObject(breadth, depth, byteLength));
			payloads.push(`${data};${breadth};${depth};${byteLength}`);
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
					const split = data.split(";");
					const workerTimeOrigin = parseFloat(split[3]);
					const messageReceivedTime = parseFloat(split[1]);
					const messageSentTime = parseFloat(split[2]);
					//
					const timeOriginDiff = workerTimeOrigin - performance.timeOrigin;
					const workerReceivedNormalized = messageReceivedTime + timeOriginDiff; // worker performance.now() normalizd to Main Thread
					const workerSentNormalized = messageSentTime + timeOriginDiff; // worker performance.now() normalizd to Main Thread
					const workerCalcTime = messageSentTime - messageReceivedTime;

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
			const startTime = performance.now();
			w.postMessage(payload);
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
