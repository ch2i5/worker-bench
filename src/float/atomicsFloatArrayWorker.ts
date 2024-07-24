import { WorkerIndices, WorkerState } from "../utils";

// Worker
let workerState: Int32Array;
let workerValues: Float64Array;
let workerData: Float64Array;

function wait() {
	Atomics.wait(workerState, WorkerIndices.WORKER_INDEX, WorkerState.WAIT, undefined);
	const received = performance.now();

	const floatAmount = workerData.length;
	const dataArray: number[] = [];
	for (let idx = 0; idx < floatAmount; idx++) {
		dataArray.push(Math.random());
	}
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
	workerData = new Float64Array(data.data);

	self.postMessage({});

	while (wait()) {}
});
