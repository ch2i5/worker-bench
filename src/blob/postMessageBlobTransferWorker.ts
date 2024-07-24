import { randomKey } from "../utils";

const encoder = new TextEncoder();
// const decoder = new TextDecoder();

const ctx: Worker = self as any;

// Worker
ctx.addEventListener("message", (m: MessageEvent) => {
	const data = m.data; // access data memory and force implcit deserialization
	const messageEventFired = performance.now();
	//
	if (typeof data === "string" && data.length === 0) {
		// create message
		self.postMessage("");
		return;
	}
	const byteLength = data.array.byteLength;

	const newData = randomKey(byteLength);
	const dataArray = encoder.encode(newData);

	const result = {
		messageReceivedTime: messageEventFired,
		messageSentTime: 0,
		workerTimeOrigin: performance.timeOrigin,
		array: dataArray.buffer,
	};
	result.messageSentTime = performance.now();
	ctx.postMessage(result, [dataArray.buffer]);
});
