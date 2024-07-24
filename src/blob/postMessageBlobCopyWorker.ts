import { randomKey } from "../utils";

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
	const byteLength = data.length;
	const estimatedMetaLength = 2 * messageEventFired.toString().length + performance.timeOrigin.toString().length;
	const keyLength = byteLength - estimatedMetaLength;
	const newData = randomKey(Math.max(keyLength, 0));
	//
	const workerEventSend = performance.now();
	self.postMessage(`${newData};${messageEventFired};${workerEventSend};${performance.timeOrigin}`);
});
