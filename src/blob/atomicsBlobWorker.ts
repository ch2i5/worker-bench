import { WorkerIndices, WorkerState, randomKey } from "../utils";

// Worker
let workerState: Int32Array;
let workerValues: Float64Array;
let workerData: Uint8Array;
const encoder = new TextEncoder();

function wait() {
	Atomics.wait(workerState, WorkerIndices.WORKER_INDEX, WorkerState.WAIT, undefined);
	const received = performance.now();

	const payload = randomKey(workerData.byteLength);
	const dataArray = encoder.encode(payload);
	workerData.set(dataArray);
	//
	workerValues[0] = received;
	workerValues[2] = performance.timeOrigin;

	const targetState = workerState[WorkerIndices.WORKER_INDEX];
	Atomics.store(workerState, WorkerIndices.WORKER_INDEX, WorkerState.WAIT);
	Atomics.store(workerState, WorkerIndices.MAIN_INDEX, WorkerState.WAKE_UP);
	workerValues[1] = performance.now();
	Atomics.notify(workerState, WorkerIndices.MAIN_INDEX, undefined);

	if (targetState !== WorkerState.TERMINATE) return true;
	return false;
}

self.addEventListener("message", (m: MessageEvent) => {
	const data = m.data;
	workerState = new Int32Array(data.state);
	workerValues = new Float64Array(data.values);
	workerData = new Uint8Array(data.data);

	self.postMessage({});

	while (wait()) {}
});
