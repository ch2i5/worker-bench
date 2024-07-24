import { generateFloatObject } from "../utils";

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
	const floatAmount = Object.keys(data).length;
	const amountDigits = Math.max(Math.floor(Math.log10(floatAmount)) + 1, 3);
	const randomKeys = Math.round(data.randomKeys) === 1;

	const newData = generateFloatObject(floatAmount, 1, amountDigits, randomKeys);
	//
	newData["messageReceivedTime"] = messageEventFired;
	newData["workerTimeOrigin"] = performance.timeOrigin;
	const workerEventSend = performance.now();
	newData["messageSentTime"] = workerEventSend;
	self.postMessage(newData);
});
