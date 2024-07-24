// Object with Breadth and Depth via JSON String PostMessage
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
	//
	const split = data.split(";");
	const breadth = Math.round(split[1]);
	const depth = Math.round(split[2]);
	const byteLength = Math.round(split[3]);

	// const estimatedMetaLength = 2 * messageEventFired.toString().length + performance.timeOrigin.toString().length;
	// const keyLength = byteLength - estimatedMetaLength;
	const newData = JSON.stringify(generateStringObject(breadth, depth, byteLength));
	//
	const workerEventSend = performance.now();
	self.postMessage(`${newData};${messageEventFired};${workerEventSend};${performance.timeOrigin}`);
});
