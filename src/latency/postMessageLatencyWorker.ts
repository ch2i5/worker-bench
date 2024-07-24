// Worker
self.addEventListener("message", (m: MessageEvent) => {
	const data = m.data; // access data memory and force implcit deserialization
	const messageEventFired = performance.now();
	// doSomeWork()
	const result = {
		messageReceivedTime: messageEventFired,
		messageSentTime: 0,
		workerTimeOrigin: performance.timeOrigin,
	};
	result.messageSentTime = performance.now();
	self.postMessage(result);
});
