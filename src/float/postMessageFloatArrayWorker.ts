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

	const newData: Array<number> = [];
	for (let idx = 0; idx < floatAmount; idx++) {
		newData.push(Math.random());
	}

	//const message = { values: newData, messageReceivedTime: messageEventFired, workerTimeOrigin: performance.timeOrigin, messageSentTime: 0 };
	//message.messageSentTime = performance.now();
	newData.push(messageEventFired);
	newData.push(performance.timeOrigin);
	newData.push(performance.now());
	self.postMessage(newData);
});
