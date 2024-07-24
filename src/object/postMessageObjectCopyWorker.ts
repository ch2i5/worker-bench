import { generateStringObject } from "../utils";

// Worker
self.addEventListener("message", (m: MessageEvent) => {
	const data = m.data; // access data memory and force implcit deserialization
	const messageEventFired = performance.now();
	//
	if (typeof data === "string" && data.length === 0) {
		// create message
		self.postMessage("");
		return;
	}
	const byteLength = data.byteLength;
	const randomKeys = Math.round(data.randomKeys) === 1;

	// const estimatedMetaLength = 2 * messageEventFired.toString().length + performance.timeOrigin.toString().length;
	// const keyLength = byteLength - estimatedMetaLength;
	const newData = generateStringObject(data.breadth, data.depth, byteLength, randomKeys);
	//
	newData["messageReceivedTime"] = messageEventFired;
	newData["workerTimeOrigin"] = performance.timeOrigin;
	const workerEventSend = performance.now();
	newData["messageSentTime"] = workerEventSend;
	self.postMessage(newData);
});
