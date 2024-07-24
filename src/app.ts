import { AtomicsLatency } from "./latency/atomicsLatency";
import { PostMessageLatency } from "./latency/postMessageLatency";
import { AtomicsSpeed } from "./speed/atomicsSpeed";
import { PostMessageSpeed } from "./speed/postMessageSpeed";
import { AtomicsBinaryObject } from "./object/atomicsBinaryObject";
import { PostMessageBinaryObject } from "./object/postMessageBinaryObject";
import { PostMessageObjectCopy } from "./object/postMessageObjectCopy";
import { AtomicsBlob } from "./blob/atomicsBlob";
import { PostMessageBlobCopy } from "./blob/postMessageBlobCopy";
import { PostMessageBlobTransfer } from "./blob/postMessageBlobTransfer";
import { benchmarkRecord, generateStringObject, h } from "./utils";
import { PostMessageFloatObject } from "./float/postMessageFloatObject";
import { PostMessageFloatArray } from "./float/postMessageFloatArray";
import { AtomicsFloatArray } from "./float/atomicsFloatArray";

/*
 * IDEAS:
 * - Create test variations if config field is array
 * - Add toggle button for 5 to 95-percentile in table
 * - "Default Settings" Buttons for each type of run (Size Throughput, Object Throughput, Latency)
 * - Calculate costs of serialization (duration) where applicable and add data to table
 */
type testConfig = {
	test: string;
	repeats: number;
	workerAmount: number;
	workerRandomDispatch: boolean;
	runs: number;
	payloadSize?: number;
	breadth?: number;
	depth?: number;
	digits?: number;
	randomKeys?: boolean;
	floatAmount?: number;
	download?: boolean;
	visualizeResults?: boolean;
	csvEndpoint?: string;
};

class Benchmark {
	#logHistory: HTMLElement;
	#wakeLock: WakeLockSentinel | null | undefined;
	#textEncoder = new TextEncoder();
	#postMessageBlobCopy = new PostMessageBlobCopy();
	#postMessageBlobTransfer = new PostMessageBlobTransfer();
	#atomicsBlob = new AtomicsBlob();
	#postMessageObjectCopy = new PostMessageObjectCopy();
	#postMessageBinaryObject = new PostMessageBinaryObject();
	#atomicsBinaryObject = new AtomicsBinaryObject();
	#postMessageFloatObject = new PostMessageFloatObject();
	#postMessageFloatArray = new PostMessageFloatArray();
	#atomicsFloatArray = new AtomicsFloatArray();
	#postMessageLatency = new PostMessageLatency();
	#atomicsLatency = new AtomicsLatency();
	#postMessageSpeed = new PostMessageSpeed();
	#atomicsSpeed = new AtomicsSpeed();

	constructor() {
		const additionalInfo = navigator.userAgent.includes("Gecko/")
			? `<br>Firefox users may disable "privacy.resistFingerprinting" and "privacy.reduceTimerPrecision" in "about:config" for increased accuracy. `
			: "";
		this.log("Negative values can occur due to performance.now() inaccuracies (User Agent fingerprinting prevention). " + additionalInfo, "info");
		// feature check
		if (!window.Worker) {
			this.log("Browser does not support WebWorkers. ", "warn");
			return;
		}
		if (!window.crossOriginIsolated) {
			this.log("CrossOriginIsolation header missing. ", "warn");
			return;
		}
		this.log(`Secure Context available. <br>WorkerBench (v1.0) `);
		this.log(`${navigator.hardwareConcurrency} logical cores reported by User Agent.`);

		this.#init();
		// check Testplan
		document.addEventListener("visibilitychange", async () => {
			if (this.#wakeLock !== undefined) {
				acquireWakeLock();
			}
		});
		const acquireWakeLock = async () => {
			try {
				if (document.visibilityState === "visible") {
					await releaseWakeLock();
					this.#wakeLock = await navigator.wakeLock.request("screen");
					console.log(`Wake Lock acquired`);
				} else {
					console.error(`Wake Lock could not be acquired: Document hidden`);
					this.#wakeLock = null;
				}
			} catch (err) {
				this.#wakeLock = null;
				console.error(`Wake Lock could not be acquired: `, err);
			}
		};
		const releaseWakeLock = async () => {
			if (this.#wakeLock !== undefined && this.#wakeLock !== null) {
				await this.#wakeLock.release().then(() => {
					console.log(`Wake Lock released`);
				});
			}
			this.#wakeLock = undefined;
		};
		const checkTestConfig = async (testconfigStr: string) => {
			try {
				const plan = JSON.parse(testconfigStr);
				if (Array.isArray(plan)) {
					await acquireWakeLock();
					for (let p of plan) {
						await this.runTest(p);
						// wait so that background tasks (and hopefully gc) can run
						await new Promise<void>((res) => {
							setTimeout(() => {
								res();
							}, 1000);
						});
					}
					await releaseWakeLock();
				} else {
					this.runTest(plan);
				}
			} catch (e) {
				this.log("Testplan could not be parsed.");
				console.error(e);
			}
		};
		const params = new URLSearchParams(new URL(window.location.href).search);
		const testconfigStr = params.get("testconfig");
		if (testconfigStr !== null) {
			checkTestConfig(testconfigStr);
		} else {
			const testconfigURL = params.get("testplan");
			if (testconfigURL !== null && testconfigURL.toLocaleLowerCase().endsWith(".json")) {
				fetch(testconfigURL)
					.then((res) => {
						return res.text();
					})
					.then((testconfigStr) => {
						checkTestConfig(testconfigStr);
					});
			}
		}
	}

	#featureTestWaitAsync() {
		if (!Atomics.waitAsync) {
			this.logResult("Browser does not support Atomics.waitAsync() ", "warn");
			this.logDivider();
			return false;
		}
		return true;
	}

	#init() {
		const testRunWrapper = h("div", { style: "display: flex;flex-direction: column;gap: 0.5rem;" });
		const blobTestWrapper = h("div", { class: "control-wrapper" });
		const objectTestWrapper = h("div", { class: "control-wrapper" });
		const floatTestWrapper = h("div", { class: "control-wrapper" });
		const latencyTestWrapper = h("div", { class: "control-wrapper" });
		const speedTestWrapper = h("div", { class: "control-wrapper" });
		const panel = h(
			"div",
			{ class: "control-panel" },
			testRunWrapper,
			blobTestWrapper,
			objectTestWrapper,
			floatTestWrapper,
			latencyTestWrapper,
			speedTestWrapper
		);
		this.#logHistory = h("div", { class: "log-history" });
		document.body.appendChild(panel);
		document.body.appendChild(this.#logHistory);
		//
		const createTestButton = (text: string, cb: CallableFunction) => {
			const btn = h("button", {
				innerHTML: text,
				events: {
					click: () => {
						cb();
					},
				},
			});
			return btn;
		};
		const createNumberInput = (text: string, startVal = 0) => {
			const minVal = startVal === 0 ? 0 : 1;
			const ipt = document.createElement("input");
			ipt.setAttribute("type", "number");
			ipt.setAttribute("min", `${minVal}`);
			ipt.valueAsNumber = startVal;
			const lbl = h("label", { innerHTML: text }, ipt);
			return { label: lbl, input: ipt };
		};
		const createCheckboxInput = (text: string, checked: boolean) => {
			const ipt = document.createElement("input");
			ipt.setAttribute("type", "checkbox");
			ipt.checked = checked;
			const lbl = h("label", { innerHTML: text });
			lbl.insertBefore(ipt, lbl.firstChild);
			return { label: lbl, input: ipt };
		};
		//
		const workerAmountInputElements = createNumberInput("Workers:&Tab;", Math.round(navigator.hardwareConcurrency / 2));
		const workerRunInputElements = createNumberInput("Runs:&Tab;", 10);
		const workerRandomDispatchOrderInputElements = createCheckboxInput("Random Dispatch Order", true);
		const visualizeRunsInputElements = createCheckboxInput("Visualize Run Results", true);
		const visualizeRuns = visualizeRunsInputElements.input;
		const workerAmount = workerAmountInputElements.input;
		const workerRuns = workerRunInputElements.input;
		const workerRandomDispatchOrder = workerRandomDispatchOrderInputElements.input;
		const testRunRepeatsInputElements = createNumberInput("Test&nbsp;Repeats:&Tab;", 0);
		const testRunRepeats = testRunRepeatsInputElements.input;
		const testPlanRow = h("div", null, testRunRepeatsInputElements.label);
		const testRunRow = h(
			"div",
			null,
			workerAmountInputElements.label,
			h("span", { innerHTML: `|`, style: "color: var(--border);" }),
			workerRunInputElements.label,
			h("span", { innerHTML: `|`, style: "color: var(--border);" }),
			workerRandomDispatchOrderInputElements.label,
			h("span", { innerHTML: `|`, style: "color: var(--border);" }),
			visualizeRunsInputElements.label
		);
		testRunWrapper.appendChild(testPlanRow);
		testRunWrapper.appendChild(testRunRow);
		//
		const blobTestHeader = h("span", { class: "test-header", innerHTML: `Blob Throughput` });
		const blobPayloadSizeUnits = document.createElement("span");
		const blobPayloadSizeInputElements = createNumberInput("Payload Size:&Tab;", 1024); // 1024 * 1024
		const blobPayloadSize = blobPayloadSizeInputElements.input;
		const updateBlobPayloadSize = () => {
			const payloadSize = blobPayloadSize.valueAsNumber;
			blobPayloadSizeUnits.innerHTML = `Bytes <span style="color: var(--border);">/</span> ${
				payloadSize / 1024
			} KiB <span style="color: var(--border);">/</span> ${payloadSize / 1024 / 1024} MiB`;
		};
		updateBlobPayloadSize();
		blobPayloadSize.addEventListener("input", updateBlobPayloadSize);
		const blobTestInputRow = h("div", null, blobPayloadSizeInputElements.label, blobPayloadSizeUnits);
		const blobTestButtonRow = h(
			"div",
			null,
			createTestButton("PostMessage Blob (Copy)", () => {
				this.testPostMessageBlobCopy({
					test: "postMessageBlobCopy",
					visualizeResults: visualizeRuns.checked,
					repeats: testRunRepeats.valueAsNumber,
					workerAmount: workerAmount.valueAsNumber,
					workerRandomDispatch: workerRandomDispatchOrder.checked,
					runs: workerRuns.valueAsNumber,
					payloadSize: blobPayloadSize.valueAsNumber,
				});
			}),
			createTestButton("PostMessage Blob (Transfer)", () => {
				this.testPostMessageBlobTransfer({
					test: "postMessageBlobTransfer",
					visualizeResults: visualizeRuns.checked,
					repeats: testRunRepeats.valueAsNumber,
					workerAmount: workerAmount.valueAsNumber,
					workerRandomDispatch: workerRandomDispatchOrder.checked,
					runs: workerRuns.valueAsNumber,
					payloadSize: blobPayloadSize.valueAsNumber,
				});
			}),
			createTestButton("Atomics Blob", () => {
				this.testAtomicsBlob({
					test: "atomicsBlob",
					visualizeResults: visualizeRuns.checked,
					repeats: testRunRepeats.valueAsNumber,
					workerAmount: workerAmount.valueAsNumber,
					workerRandomDispatch: workerRandomDispatchOrder.checked,
					runs: workerRuns.valueAsNumber,
					payloadSize: blobPayloadSize.valueAsNumber,
				});
			})
		);
		blobTestWrapper.appendChild(blobTestHeader);
		blobTestWrapper.appendChild(blobTestInputRow);
		blobTestWrapper.appendChild(blobTestButtonRow);
		//
		const objectTestHeader = h("span", { class: "test-header", innerHTML: `Object Complexity Throughput` });
		const objectUnits = h("span");
		const objectBreadthInputElements = createNumberInput("Breadth:&Tab;", 1);
		const objectDepthInputElements = createNumberInput(` <span style="color: var(--border);">|</span> Depth:&Tab;`, 1);
		const objectLenInputElements = createNumberInput(` <span style="color: var(--border);">|</span> Length:&Tab;`, 16);
		const objBreadth = objectBreadthInputElements.input;
		const objDepth = objectDepthInputElements.input;
		const objLen = objectLenInputElements.input;
		let objectBufferSize = 0;
		const objectRandomKeysInputElements = createCheckboxInput("Random Object Keys", true);
		const randomKeysObject = objectRandomKeysInputElements.input;
		const objectTestInputRow = h(
			"div",
			null,
			objectBreadthInputElements.label,
			objectDepthInputElements.label,
			objectLenInputElements.label,
			objectUnits,
			h("span", { innerHTML: `|`, style: `color: var(--border);` }),
			objectRandomKeysInputElements.label
		);
		const updateObjectSize = () => {
			const breadth = objBreadth.valueAsNumber;
			const depth = objDepth.valueAsNumber;
			const len = objLen.valueAsNumber;
			const obj = JSON.stringify(generateStringObject(breadth, depth, len));
			objectBufferSize = obj.length;
			objectUnits.innerHTML = ` <span style="color: var(--border);">|</span> ${objectBufferSize} B <span style="color: var(--border);">/</span> ${
				objectBufferSize / 1024
			} KiB <span style="color: var(--border);">/</span> ${objectBufferSize / 1024 / 1024} MiB`;
		};
		updateObjectSize();
		objBreadth.addEventListener("input", updateObjectSize);
		// objBreadth.setAttribute("max", "6");
		objDepth.addEventListener("input", updateObjectSize);
		objDepth.setAttribute("max", "6");
		objLen.addEventListener("input", updateObjectSize);
		const objectTestButtonRow = h(
			"div",
			null,
			createTestButton("PostMessage Object (Copy/StructuredClone)", () => {
				this.testPostMessageObjectCopy({
					test: "postMessageObjectCopy",
					visualizeResults: visualizeRuns.checked,
					repeats: testRunRepeats.valueAsNumber,
					workerAmount: workerAmount.valueAsNumber,
					workerRandomDispatch: workerRandomDispatchOrder.checked,
					runs: workerRuns.valueAsNumber,
					breadth: objBreadth.valueAsNumber,
					depth: objDepth.valueAsNumber,
					digits: objLen.valueAsNumber,
					randomKeys: randomKeysObject.checked,
				});
			}),
			createTestButton("PostMessage Object (Binary Encoded)", () => {
				this.testPostMessageBinaryObject({
					test: "postMessageBinaryObject",
					visualizeResults: visualizeRuns.checked,
					repeats: testRunRepeats.valueAsNumber,
					workerAmount: workerAmount.valueAsNumber,
					workerRandomDispatch: workerRandomDispatchOrder.checked,
					runs: workerRuns.valueAsNumber,
					breadth: objBreadth.valueAsNumber,
					depth: objDepth.valueAsNumber,
					digits: objLen.valueAsNumber,
				});
			}),
			createTestButton("Atomics Object (Binary Encoded)", () => {
				this.testAtomicsBinaryObject({
					test: "atomicsBinaryObject",
					visualizeResults: visualizeRuns.checked,
					repeats: testRunRepeats.valueAsNumber,
					workerAmount: workerAmount.valueAsNumber,
					workerRandomDispatch: workerRandomDispatchOrder.checked,
					runs: workerRuns.valueAsNumber,
					breadth: objBreadth.valueAsNumber,
					depth: objDepth.valueAsNumber,
					digits: objLen.valueAsNumber,
					randomKeys: randomKeysObject.checked,
				});
			})
		);
		objectTestWrapper.appendChild(objectTestHeader);
		objectTestWrapper.appendChild(objectTestInputRow);
		objectTestWrapper.appendChild(objectTestButtonRow);
		//
		const floatTestHeader = h("span", { class: "test-header", innerHTML: `Float Throughput` });
		const floatAmountInputElements = createNumberInput("Float Amount:&Tab;", 100);
		const floatRandomKeysInputElements = createCheckboxInput("Random Object Keys", true);
		const randomKeysFloat = floatRandomKeysInputElements.input;
		const floatAmount = floatAmountInputElements.input;
		const floatTestInputRow = h(
			"div",
			null,
			floatAmountInputElements.label,
			h("span", { innerHTML: `|`, style: `color: var(--border);` }),
			floatRandomKeysInputElements.label
		);
		const floatTestButtonRow = h(
			"div",
			null,
			createTestButton("PostMessage Float Object (Copy)", () => {
				this.testPostMessageFloatObject({
					test: "postMessageFloatObject",
					visualizeResults: visualizeRuns.checked,
					repeats: testRunRepeats.valueAsNumber,
					workerAmount: workerAmount.valueAsNumber,
					workerRandomDispatch: workerRandomDispatchOrder.checked,
					runs: workerRuns.valueAsNumber,
					floatAmount: floatAmount.valueAsNumber,
					randomKeys: randomKeysFloat.checked,
				});
			}),
			createTestButton("PostMessage Float Array (Copy)", () => {
				this.testPostMessageFloatArray({
					test: "postMessageFloatArray",
					visualizeResults: visualizeRuns.checked,
					repeats: testRunRepeats.valueAsNumber,
					workerAmount: workerAmount.valueAsNumber,
					workerRandomDispatch: workerRandomDispatchOrder.checked,
					runs: workerRuns.valueAsNumber,
					floatAmount: floatAmount.valueAsNumber,
				});
			}),
			createTestButton("Atomics Float Array", () => {
				this.testAtomicsFloatArray({
					test: "atomicsFloatArray",
					visualizeResults: visualizeRuns.checked,
					repeats: testRunRepeats.valueAsNumber,
					workerAmount: workerAmount.valueAsNumber,
					workerRandomDispatch: workerRandomDispatchOrder.checked,
					runs: workerRuns.valueAsNumber,
					floatAmount: floatAmount.valueAsNumber,
				});
			})
		);
		floatTestWrapper.appendChild(floatTestHeader);
		floatTestWrapper.appendChild(floatTestInputRow);
		floatTestWrapper.appendChild(floatTestButtonRow);
		//
		const latencyTestHeader = h("span", { class: "test-header", innerHTML: `Latency Synchronized (with Barrier)` });
		const latencyTestButtonRow = h(
			"div",
			null,
			createTestButton("PostMessage Latency Synchronized", () => {
				this.testPostMessageLatency({
					test: "postMessageLatency",
					visualizeResults: visualizeRuns.checked,
					repeats: testRunRepeats.valueAsNumber,
					workerAmount: workerAmount.valueAsNumber,
					workerRandomDispatch: workerRandomDispatchOrder.checked,
					runs: workerRuns.valueAsNumber,
				});
			}),
			createTestButton("Atomics Latency Synchronized", () => {
				this.testAtomicsLatency({
					test: "atomicsLatency",
					visualizeResults: visualizeRuns.checked,
					repeats: testRunRepeats.valueAsNumber,
					workerAmount: workerAmount.valueAsNumber,
					workerRandomDispatch: workerRandomDispatchOrder.checked,
					runs: workerRuns.valueAsNumber,
				});
			})
		);
		latencyTestWrapper.appendChild(latencyTestHeader);
		latencyTestWrapper.appendChild(latencyTestButtonRow);
		//
		const speedTestHeader = h("span", { class: "test-header", innerHTML: `Latency Unsynchronized (without Barrier) / Speed` });
		const speedTestButtonRow = h(
			"div",
			null,
			createTestButton("PostMessage Latency Unsynchronized", () => {
				this.testPostMessageSpeed({
					test: "postMessageSpeed",
					visualizeResults: visualizeRuns.checked,
					repeats: testRunRepeats.valueAsNumber,
					workerAmount: workerAmount.valueAsNumber,
					workerRandomDispatch: workerRandomDispatchOrder.checked,
					runs: workerRuns.valueAsNumber,
				});
			}),
			createTestButton("Atomics Latency Unsynchronized", () => {
				this.testAtomicsSpeed({
					test: "atomicsSpeed",
					visualizeResults: visualizeRuns.checked,
					repeats: testRunRepeats.valueAsNumber,
					workerAmount: workerAmount.valueAsNumber,
					workerRandomDispatch: workerRandomDispatchOrder.checked,
					runs: workerRuns.valueAsNumber,
				});
			})
		);
		speedTestWrapper.appendChild(speedTestHeader);
		speedTestWrapper.appendChild(speedTestButtonRow);
	}

	async runTest(config: any) {
		try {
			let result = false;
			switch (config.test) {
				case "atomicsBlob":
					result = await this.testAtomicsBlob(config);
					break;
				case "postMessageBlobCopy":
					result = await this.testPostMessageBlobCopy(config);
					break;
				case "postMessageBlobTransfer":
					result = await this.testPostMessageBlobTransfer(config);
					break;
				case "atomicsBinaryObject":
					result = await this.testAtomicsBinaryObject(config);
					break;
				case "postMessageBinaryObject":
					result = await this.testPostMessageBinaryObject(config);
					break;
				case "postMessageObjectCopy":
					result = await this.testPostMessageObjectCopy(config);
					break;
				case "atomicsFloatArray":
					result = await this.testAtomicsFloatArray(config);
					break;
				case "postMessageFloatArray":
					result = await this.testPostMessageFloatArray(config);
					break;
				case "postMessageFloatObject":
					result = await this.testPostMessageFloatObject(config);
					break;
				case "atomicsLatency":
					result = await this.testAtomicsLatency(config);
					break;
				case "postMessageLatency":
					result = await this.testPostMessageLatency(config);
					break;
				case "atomicsSpeed":
					result = await this.testPostMessageSpeed(config);
					break;
				case "postMessageSpeed":
					result = await this.testAtomicsSpeed(config);
					break;
				default:
					this.logResult(`Test not found: "${config.test}"`);
			}
			if (!result) {
				this.logResult(`Test could not be run: "${config.test}"`);
			}
		} catch (ex) {
			this.logResult(`Test Error: ${ex}`);
		}
	}

	calculateMedian(dataSet: number[]) {
		const middle = Math.floor(dataSet.length / 2);
		return dataSet.length % 2 ? dataSet[middle] : (dataSet[middle - 1] + dataSet[middle]) / 2;
	}

	calculateVariance(mean: number, dataSet: number[]) {
		// const mean = calculateMean(data);
		const squaredDifferences = dataSet.map((value) => {
			const difference = value - mean;
			return difference * difference;
		});
		return squaredDifferences.reduce((acc, value) => acc + value, 0) / dataSet.length;
	}

	calculatePercentile(sortedData: number[], percentile: number) {
		//const sortedData = data.slice().sort((a, b) => a - b);
		const index = (percentile / 100) * (sortedData.length - 1);
		if (Number.isInteger(index)) {
			return sortedData[index];
		} else {
			const lowerIndex = Math.floor(index);
			const upperIndex = Math.ceil(index);
			const weight = index - lowerIndex;
			return sortedData[lowerIndex] * (1 - weight) + sortedData[upperIndex] * weight;
		}
	}

	filterBetweenPercentiles(data: number[], lowerPercentile: number, upperPercentile: number) {
		const lowerValue = this.calculatePercentile(data, lowerPercentile);
		const upperValue = this.calculatePercentile(data, upperPercentile);
		return data.filter((value) => value >= lowerValue && value <= upperValue);
	}

	formatBytes(bytes: number) {
		let unit = "Bytes";
		let newVal = bytes;
		if (newVal / 1024 >= 1) {
			newVal = newVal / 1024;
			unit = "KiB";
		}
		if (newVal / 1024 >= 1) {
			newVal = newVal / 1024;
			unit = "MiB";
		}
		return `${newVal.toFixed(2)} ${unit}`;
	}

	formatShape(breadth: number, depth: number, length: number) {
		return `B${breadth} D${depth} L${length}`;
	}

	allocResultArray(runs: number, workers: number) {
		const template = { workerIdx: -1, roundtrip: 0, toWorker: 0, fromWorker: 0 };
		const benchRes: benchmarkRecord[][] = new Array(runs);
		for (let r = 0; r < runs; r++) {
			const ws: benchmarkRecord[] = new Array(workers);
			for (let w = 0; w < workers; w++) {
				ws[w] = Object.create(template);
			}
			benchRes[r] = ws;
		}
		return benchRes;
	}

	logBenchmarkTable(repGroups: Array<benchmarkRecord[][]>, filenameMeta = "", config?: testConfig) {
		// [TestRepeats][Worker][Runs]
		const downloadRawDataResults = () => {
			let csvRaw = `Test Repeat;Worker ID;Run ID;Roundtrip;to Worker;from Worker`;
			for (let repeatIdx = 0; repeatIdx < repGroups.length; repeatIdx++) {
				const groupedWorkers = repGroups[repeatIdx];
				for (let workerIdx = 0; workerIdx < groupedWorkers.length; workerIdx++) {
					const runResults = groupedWorkers[workerIdx];
					for (let runId = 0; runId < runResults.length; runId++) {
						const run = runResults[runId];
						csvRaw +=
							`\n` +
							`${repeatIdx};` +
							`${workerIdx + 1};` +
							`${runId + 1};` +
							`${run.roundtrip};` +
							`${run.toWorker};` +
							`${run.fromWorker}`;
					}
				}
			}
			if (config !== undefined && config.csvEndpoint !== undefined) {
				const endPoint = config.csvEndpoint.endsWith("/") ? config.csvEndpoint : `${config.csvEndpoint}/`;
				fetch(`${endPoint}${filenameMeta}_Raw.csv`, {
					method: "PUT",
					headers: {
						"Content-Type": "text/csv",
					},
					body: csvRaw,
				});
			} else {
				this.downloadFile(new Blob([csvRaw], { type: "text/csv" }), `${filenameMeta}_Raw.csv`);
			}
		};
		if (
			config &&
			config.download !== undefined &&
			config.download === true &&
			config.visualizeResults !== undefined &&
			config.visualizeResults === false
		) {
			downloadRawDataResults();
			return;
		}
		let csvTable = `Worker ID;Roundtrip Duration Sum;Roundtrip AVG;Roundtrip Median;Roundtrip Variance;to Worker AVG;to Worker Median;to Worker Variance;from Worker AVG;from Worker Median;from Worker Variance`;
		const table = h("table");
		const thead = h("thead", {
			innerHTML: `
				<tr>
					<th scope="col" rowspan="2">Worker ID</th>
					<th scope="col" rowspan="2">Transmission Runtime</th>
					<th scope="col" colspan="3">Roundtrip</th>
					<th scope="col" colspan="3">to / from Worker</th>
				</tr>
				<tr>
					<th scope="col">Median</th>
					<th scope="col">Average</th>
					<th scope="col">Variance</th>
					<th scope="col">Time Ratio</th>
					<th scope="col">to-Worker Variance</th>
					<th scope="col">from-Worker Variance</th>
				</tr>`,
		});
		const tbody = h("tbody");
		const tfoot = h("tfoot");

		const addRow = (...col: string[]) => {
			const row = h("tr");
			tbody.appendChild(row);
			for (let c of col) {
				row.appendChild(h("td", { innerHTML: c }));
			}
		};
		const precisionDigits = 6;

		// array with all workers (containing runs) from repeated tests
		const groupedWorkers = Object.values(
			Object.groupBy(
				repGroups
					.map((repeatItem, repeatIdx) => {
						return repeatItem.map((workerItem) => {
							return workerItem.map((runItem, runIdx) => {
								return { repeatIdx: repeatIdx, runIdx: runIdx, ...runItem };
							});
						});
					})
					.flat(2),
				(item) => item.workerIdx
			)
		);
		const flattenedRuns = groupedWorkers.slice().flat(1);
		// results for each individual worker (aggregated runs)
		const allWorkerRoundtrips = flattenedRuns.map((obj) => obj!.roundtrip).sort((a, b) => a - b);
		const allToWorkerRuns = flattenedRuns.map((obj) => obj!.toWorker).sort((a, b) => a - b);
		const allFromWorkerRuns = flattenedRuns.map((obj) => obj!.fromWorker).sort((a, b) => a - b);
		const allTimeRatios = [];
		for (let workerIdx = 0; workerIdx < groupedWorkers.length; workerIdx++) {
			// [Worker{1,2,3,4}][Runs{roundtrip,to,from}]
			const workerResults = groupedWorkers[workerIdx]!;
			let sortedRountrip = workerResults.map((obj) => obj.roundtrip).sort((a, b) => a - b);
			let sortedToWorker = workerResults.map((obj) => obj.toWorker).sort((a, b) => a - b);
			let sortedFromWorker = workerResults.map((obj) => obj.fromWorker).sort((a, b) => a - b);
			//
			const roundtripSum = sortedRountrip.reduce((a, b) => a + b, 0);
			// allWorkerRoundtripSum += roundtripSum / repGroups.length;
			const roundtripAvg = roundtripSum / sortedRountrip.length;
			// allWorkerRoundtripAvg += roundtripAvg;
			const toWorkerAvg = sortedToWorker.reduce((a, b) => a + b, 0) / sortedToWorker.length;
			const fromWorkerAvg = sortedFromWorker.reduce((a, b) => a + b, 0) / sortedFromWorker.length;
			const roundtripVariance = this.calculateVariance(roundtripAvg, sortedRountrip);
			const toWorkerVariance = this.calculateVariance(toWorkerAvg, sortedToWorker);
			const fromWorkerVariance = this.calculateVariance(fromWorkerAvg, sortedFromWorker);
			const roundtripMedian = this.calculateMedian(sortedRountrip);
			const toWorkerMedian = this.calculateMedian(sortedToWorker);
			const fromWorkerMedian = this.calculateMedian(sortedFromWorker);
			//
			const timeRatio = toWorkerAvg / (toWorkerAvg + fromWorkerAvg);
			allTimeRatios.push(timeRatio);
			// console.log(`WorkerID: ${workerIdx}, to: ${toWorkerAvg}, from: ${fromWorkerAvg}`);
			addRow(
				`Worker&nbsp;${workerIdx + 1}`,
				`${(roundtripSum / repGroups.length).toFixed(3)}&nbsp;ms`,
				`${roundtripMedian.toFixed(precisionDigits)}&nbsp;ms`,
				`${roundtripAvg.toFixed(precisionDigits)}&nbsp;ms`,
				`${roundtripVariance.toFixed(precisionDigits)}&nbsp;ms`,
				`<span class="ratio" style="--ratio: ${timeRatio};">${(timeRatio * 100).toFixed(2)}%</span>`,
				`${toWorkerVariance.toFixed(precisionDigits)}&nbsp;ms`,
				`${fromWorkerVariance.toFixed(precisionDigits)}&nbsp;ms`
			);
			csvTable +=
				`\n` +
				`Worker ${workerIdx + 1};` +
				`${(roundtripSum / repGroups.length).toFixed(3)};` +
				`${roundtripAvg.toFixed(precisionDigits)};` +
				`${roundtripMedian.toFixed(precisionDigits)};` +
				`${roundtripVariance.toFixed(precisionDigits)}` +
				`${toWorkerAvg.toFixed(precisionDigits)};` +
				`${toWorkerMedian.toFixed(precisionDigits)};` +
				`${toWorkerVariance.toFixed(precisionDigits)}` +
				`${fromWorkerAvg.toFixed(precisionDigits)};` +
				`${fromWorkerMedian.toFixed(precisionDigits)}` +
				`${fromWorkerVariance.toFixed(precisionDigits)}`;
		}
		// results for each all workers (aggregated runs)
		if (groupedWorkers.length > 1) {
			let allWorkerRoundtripSum = allWorkerRoundtrips.reduce((a, b) => a + b, 0);
			let allWorkerRoundtripAvg = allWorkerRoundtripSum / allWorkerRoundtrips.length;
			allWorkerRoundtripSum /= groupedWorkers.length;
			allWorkerRoundtripSum /= repGroups.length;
			const allWorkerRoundtripMedian = this.calculateMedian(allWorkerRoundtrips);
			const allWorkerRoundtripVariance = this.calculateVariance(allWorkerRoundtripAvg, allWorkerRoundtrips);
			const allToWorkerRunsAvg = allToWorkerRuns.reduce((a, b) => a + b, 0) / allToWorkerRuns.length;
			const allToWorkerRunsVariance = this.calculateVariance(allToWorkerRunsAvg, allToWorkerRuns);
			const allFromWorkerRunsAvg = allFromWorkerRuns.reduce((a, b) => a + b, 0) / allFromWorkerRuns.length;
			const allFromWorkerRunsVariance = this.calculateVariance(allFromWorkerRunsAvg, allFromWorkerRuns);
			const allTimeRatioValue = allTimeRatios.reduce((a, b) => a + b, 0) / allTimeRatios.length;
			tfoot.appendChild(
				h(
					"tr",
					null,
					h("th", { innerHTML: "All&nbsp;Workers" }),
					h("td", { innerHTML: `${allWorkerRoundtripSum.toFixed(3)}&nbsp;ms` }),
					h("td", { innerHTML: `${allWorkerRoundtripMedian.toFixed(precisionDigits)}&nbsp;ms` }),
					h("td", { innerHTML: `${allWorkerRoundtripAvg.toFixed(precisionDigits)}&nbsp;ms` }),
					h("td", { innerHTML: `${allWorkerRoundtripVariance.toFixed(precisionDigits)}&nbsp;ms` }),
					h("td", {
						innerHTML: `<span class="ratio" style="--ratio: ${allTimeRatioValue};">${(allTimeRatioValue * 100).toFixed(2)}%</span>`,
					}),
					h("td", { innerHTML: `${allToWorkerRunsVariance.toFixed(precisionDigits)}&nbsp;ms` }),
					h("td", { innerHTML: `${allFromWorkerRunsVariance.toFixed(precisionDigits)}&nbsp;ms` })
				)
			);
		}
		// results for each run (aggregate repeats)
		const groupedRuns = Object.values(Object.groupBy(flattenedRuns, (item) => item!.runIdx));
		const runResults = groupedRuns.map((runArray) => {
			const runRoundtrips = runArray!.map((i) => i!.roundtrip).sort((a, b) => a - b);
			const roundtripSum = runRoundtrips.reduce((a, b) => a + b, 0);
			const roundtripAvg = roundtripSum / runRoundtrips.length;
			const roundtripVariance = this.calculateVariance(roundtripAvg, runRoundtrips);
			const roundtripMedian = this.calculateMedian(runRoundtrips);
			return {
				runIdx: runArray![0]!.runIdx,
				roundtripMedian: roundtripMedian,
				roundtripAverage: roundtripAvg,
				roundtripVariance: roundtripVariance,
				shortestRoundtrip: Math.min(...runRoundtrips),
				longestRoundtrip: Math.max(...runRoundtrips),
			};
		});
		if (!(config && config.visualizeResults !== undefined && config.visualizeResults === false)) {
			// console.log(runResults);
			const shortestRun = Math.min(...runResults.map((obj) => obj.shortestRoundtrip));
			const longestRun = Math.max(...runResults.map((obj) => obj.longestRoundtrip));
			const centerRun = (shortestRun + longestRun) / 2;
			const yLimit = longestRun * 1.1; // add 10% padding
			// quick hack, should probably create svg instead of using html DOM elements
			const timeGraph = h(
				"div",
				{ class: "time-graph", style: `--x-limit: ${runResults.length};--y-limit: ${yLimit};` },
				h("span", {
					class: "graph-label",
					innerHTML: `Runs&nbsp;<span style="font-size: 1.75rem;">&rarr;</span>`,
					style: `right: 0rem;top: calc(100% + 0.5rem);`,
				}),
				h("span", {
					class: "graph-label",
					innerHTML: `${shortestRun.toFixed(3)}&nbsp;ms`,
					style: `left: 0;top: calc(100% - (100% / var(--y-limit) * ${shortestRun}))`,
				}),
				h("span", {
					class: "graph-label",
					innerHTML: `${centerRun.toFixed(3)}&nbsp;ms`,
					style: `left: 0;top: calc(100% - (100% / var(--y-limit) * ${centerRun}))`,
				}),
				h("span", {
					class: "graph-label",
					innerHTML: `${longestRun.toFixed(3)}&nbsp;ms`,
					style: `left: 0;top: calc(100% - (100% / var(--y-limit) * ${longestRun}))`,
				})
			);
			for (let runIdx = 0; runIdx < runResults.length; runIdx++) {
				const run = runResults[runIdx]!;
				timeGraph.appendChild(
					h("div", {
						class: "data-point-range",
						style: `--runIdx: ${run.runIdx};--shortest: ${run.shortestRoundtrip};--longest: ${run.longestRoundtrip};`,
					})
				);
				timeGraph.appendChild(
					h("div", {
						class: "data-point-variance",
						style: `--runIdx: ${run.runIdx};--roundtrip-average: ${run.roundtripAverage};--roundtrip-median: ${run.roundtripMedian};--roundtrip-variance: ${run.roundtripVariance};`,
					})
				);
				// timeGraph.appendChild(
				// 	h("div", {
				// 		class: "data-point",
				// 		style: `--runIdx: ${run.runIdx};--roundtrip-average: ${run.roundtripAverage};--roundtrip-median: ${run.roundtripMedian};--roundtrip-variance: ${run.roundtripVariance};`,
				// 	})
				// );
			}
			this.#logHistory.insertBefore(timeGraph, this.#logHistory.firstChild);
		}
		// TODO apply filtering to Testplan runs in order to get rid of negative values
		// if (this.#filterPercentiles) {
		// 	sortedRountrip = this.filterBetweenPercentiles(sortedRountrip, 5, 95);
		// 	sortedToWorker = this.filterBetweenPercentiles(sortedToWorker, 5, 95);
		// 	sortedFromWorker = this.filterBetweenPercentiles(sortedFromWorker, 5, 95);
		// }
		table.appendChild(thead);
		table.appendChild(tbody);
		table.appendChild(tfoot);
		// Downloads
		const downloadRaw = h("button", {
			innerHTML: `Download Raw Testdata (CSV)`,
			events: {
				click: () => {
					downloadRawDataResults();
				},
			},
		});
		const downloadTable = h("button", {
			innerHTML: `Download Table Data (CSV)`,
			events: {
				click: () => {
					this.downloadFile(new Blob([csvTable], { type: "text/csv" }), `${filenameMeta}_Table.csv`);
				},
			},
		});
		const actionWrapper = h("div", { class: "log-action" }, downloadRaw, downloadTable);
		const tableWrapper = h("div", { class: "table-wrapper" }, table);
		this.#logHistory.insertBefore(actionWrapper, this.#logHistory.firstChild);
		this.#logHistory.insertBefore(tableWrapper, this.#logHistory.firstChild);
	}

	downloadFile(blob: Blob, name: string) {
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.setAttribute("download", name);
		// document.body.appendChild(a);
		a.click();
		window.URL.revokeObjectURL(a.href);
		// document.body.removeChild(a);
	}

	byteLength(str: string) {
		const encoded = this.#textEncoder.encode(str);
		return encoded.length;
	}

	currentDate() {
		const now = new Date();
		const year = now.getFullYear();
		const month = String(now.getMonth() + 1).padStart(2, "0");
		const day = String(now.getDate()).padStart(2, "0");
		const hours = String(now.getHours()).padStart(2, "0");
		const minutes = String(now.getMinutes()).padStart(2, "0");
		const seconds = String(now.getSeconds()).padStart(2, "0");
		return `${year}.${month}.${day} ${hours}:${minutes}:${seconds}`;
	}

	formatDate(date: string) {
		const dateSplit = date.split(" ");
		const datePart = dateSplit[0].split(".");
		const timePart = dateSplit[1].split(":");
		return `${datePart[0]}-${datePart[1]}-${datePart[2]}_${timePart[0]}-${timePart[1]}-${timePart[2]}`;
	}

	log(text: string, classes?: string) {
		const message = document.createElement("span");
		message.classList.add("log");
		message.innerHTML = text;
		if (classes) message.classList.add(...classes.split(" "));
		document.body.appendChild(message);
	}

	logResult(text: string, classes?: string) {
		const message = document.createElement("span");
		message.classList.add("log");
		message.innerHTML = text;
		if (classes) message.classList.add(...classes.split(" "));
		this.#logHistory.insertBefore(message, this.#logHistory.firstChild);
	}

	logDivider() {
		const element = document.createElement("div");
		element.classList.add("log-divider");
		this.#logHistory.insertBefore(element, this.#logHistory.firstChild);
	}

	/*
	 * BENCHMARK FUNCTIONS
	 */

	async testPostMessageBlobCopy(config: testConfig) {
		if (!("payloadSize" in config)) return false;
		document.body.classList.add("run");
		const repeatRes: Array<benchmarkRecord[][]> = [];
		let benchDurationSum = 0;
		for (let rep = 0; rep <= config.repeats; rep++) {
			const benchRes: benchmarkRecord[][] = this.allocResultArray(config.runs, config.workerAmount);
			await this.#postMessageBlobCopy.init(config.workerAmount);
			// benchmark
			const benchStart = performance.now();
			for (let r = 0; r < config.runs; r++) {
				const runRes = benchRes[r];
				await this.#postMessageBlobCopy.benchmark(runRes, config.workerRandomDispatch, config.payloadSize!);
			}
			const benchEnd = performance.now();
			const duration = benchEnd - benchStart;
			benchDurationSum += duration;
			await this.#postMessageBlobCopy.teardown();
			const groupedWorkers = Object.values(Object.groupBy(benchRes.flat(1), ({ workerIdx }) => workerIdx));
			repeatRes.push(groupedWorkers as benchmarkRecord[][]);
		}
		const formattedPayload = this.formatBytes(config.payloadSize!);
		const size = formattedPayload.split(".")[0] + formattedPayload.split(" ")[1];
		const datetime = this.currentDate();
		this.logBenchmarkTable(
			repeatRes,
			`${this.formatDate(datetime)}_PostMessage_Blob_Copy_${size}_${config.repeats}Repeats_${config.workerAmount}Workers_${config.runs}Runs_${
				config.workerRandomDispatch ? "Shuffled" : "Serial"
			}Dispatch`,
			config
		);
		this.logResult(
			`<span class="time-label">${datetime}</span><br>PostMessage Blob Copy - ${formattedPayload}, ${config.repeats} Repeats, ${
				config.workerAmount
			} Workers, ${config.runs} Runs, Average Test Time: ${(benchDurationSum / (config.repeats + 1)).toFixed(3)} ms`
		);
		this.logDivider();
		document.body.classList.remove("run");
		return true;
	}

	async testPostMessageBlobTransfer(config: testConfig) {
		if (!("payloadSize" in config)) return false;
		document.body.classList.add("run");
		const repeatRes: Array<benchmarkRecord[][]> = [];
		let benchDurationSum = 0;
		for (let rep = 0; rep <= config.repeats; rep++) {
			const benchRes: benchmarkRecord[][] = this.allocResultArray(config.runs, config.workerAmount);
			await this.#postMessageBlobTransfer.init(config.workerAmount);
			// benchmark
			const benchStart = performance.now();
			for (let r = 0; r < config.runs; r++) {
				const runRes = benchRes[r];
				await this.#postMessageBlobTransfer.benchmark(runRes, config.workerRandomDispatch, config.payloadSize!);
			}
			const benchEnd = performance.now();
			const duration = benchEnd - benchStart;
			benchDurationSum += duration;
			await this.#postMessageBlobTransfer.teardown();
			const groupedWorkers = Object.values(Object.groupBy(benchRes.flat(1), ({ workerIdx }) => workerIdx));
			repeatRes.push(groupedWorkers as benchmarkRecord[][]);
		}
		const formattedPayload = this.formatBytes(config.payloadSize!);
		const size = formattedPayload.split(".")[0] + formattedPayload.split(" ")[1];
		const datetime = this.currentDate();
		this.logBenchmarkTable(
			repeatRes,
			`${this.formatDate(datetime)}_PostMessage_Blob_Transfer_${size}_${config.repeats}Repeats_${config.workerAmount}Workers_${
				config.runs
			}Runs_${config.workerRandomDispatch ? "Shuffled" : "Serial"}Dispatch`,
			config
		);
		this.logResult(
			`<span class="time-label">${datetime}</span><br>PostMessage Blob Transfer - ${formattedPayload}, ${config.repeats} Repeats, ${
				config.workerAmount
			} Workers, ${config.runs} Runs, Average Test Time: ${(benchDurationSum / (config.repeats + 1)).toFixed(3)} ms`
		);
		this.logDivider();
		document.body.classList.remove("run");
		return true;
	}

	async testAtomicsBlob(config: testConfig) {
		if (!this.#featureTestWaitAsync()) return false;
		if (!("payloadSize" in config)) return false;
		document.body.classList.add("run");
		const repeatRes: Array<benchmarkRecord[][]> = [];
		let benchDurationSum = 0;
		for (let rep = 0; rep <= config.repeats; rep++) {
			const benchRes: benchmarkRecord[][] = this.allocResultArray(config.runs, config.workerAmount);
			await this.#atomicsBlob.init(config.payloadSize!, config.workerAmount);
			// benchmark
			const benchStart = performance.now();
			for (let r = 0; r < config.runs; r++) {
				const runRes = benchRes[r];
				await this.#atomicsBlob.benchmark(runRes, config.workerRandomDispatch, config.payloadSize!);
			}
			const benchEnd = performance.now();
			const duration = benchEnd - benchStart;
			benchDurationSum += duration;
			await this.#atomicsBlob.teardown();
			const groupedWorkers = Object.values(Object.groupBy(benchRes.flat(1), ({ workerIdx }) => workerIdx));
			repeatRes.push(groupedWorkers as benchmarkRecord[][]);
		}
		const formattedPayload = this.formatBytes(config.payloadSize!);
		const size = formattedPayload.split(".")[0] + formattedPayload.split(" ")[1];
		const datetime = this.currentDate();
		this.logBenchmarkTable(
			repeatRes,
			`${this.formatDate(datetime)}_Atomics_Blob_${size}_${config.repeats}Repeats_${config.workerAmount}Workers_${config.runs}Runs_${
				config.workerRandomDispatch ? "Shuffled" : "Serial"
			}Dispatch`,
			config
		);
		this.logResult(
			`<span class="time-label">${datetime}</span><br>Atomics Blob - ${formattedPayload}, ${config.repeats} Repeats, ${
				config.workerAmount
			} Workers, ${config.runs} Runs, Average Test Time: ${(benchDurationSum / (config.repeats + 1)).toFixed(3)} ms`
		);
		this.logDivider();
		document.body.classList.remove("run");
		return true;
	}

	async testPostMessageObjectCopy(config: testConfig) {
		if (!("breadth" in config)) return false;
		if (!("depth" in config)) return false;
		if (!("digits" in config)) return false;
		if (!("randomKeys" in config)) return false;
		document.body.classList.add("run");
		const repeatRes: Array<benchmarkRecord[][]> = [];
		let benchDurationSum = 0;
		for (let rep = 0; rep <= config.repeats; rep++) {
			const benchRes: benchmarkRecord[][] = this.allocResultArray(config.runs, config.workerAmount);
			await this.#postMessageObjectCopy.init(config.workerAmount);
			// benchmark
			const benchStart = performance.now();
			for (let r = 0; r < config.runs; r++) {
				const runRes = benchRes[r];
				await this.#postMessageObjectCopy.benchmark(
					runRes,
					config.workerRandomDispatch,
					config.breadth!,
					config.depth!,
					config.digits!,
					config.randomKeys!
				);
			}
			const benchEnd = performance.now();
			const duration = benchEnd - benchStart;
			benchDurationSum += duration;
			await this.#postMessageObjectCopy.teardown();
			const groupedWorkers = Object.values(Object.groupBy(benchRes.flat(1), ({ workerIdx }) => workerIdx));
			repeatRes.push(groupedWorkers as benchmarkRecord[][]);
		}
		const shape = this.formatShape(config.breadth!, config.depth!, config.digits!);
		const datetime = this.currentDate();
		this.logBenchmarkTable(
			repeatRes,
			`${this.formatDate(datetime)}_PostMessage_Object_Copy_${shape.replaceAll(" ", "")}_${config.repeats}Repeats_${
				config.workerAmount
			}Workers_${config.runs}Runs_${config.workerRandomDispatch ? "Shuffled" : "Serial"}Dispatch_${
				config.randomKeys ? "Random" : "Deterministic"
			}Keys`,
			config
		);
		this.logResult(
			`<span class="time-label">${datetime}</span><br>PostMessage Object Copy - ${shape}, ${
				config.randomKeys ? "Random" : "Deterministic"
			} Keys, ${config.repeats} Repeats, ${config.workerAmount} Workers, ${config.runs} Runs, Average Test Time: ${(
				benchDurationSum /
				(config.repeats + 1)
			).toFixed(3)} ms`
		);
		this.logDivider();
		document.body.classList.remove("run");
		return true;
	}

	async testPostMessageBinaryObject(config: testConfig) {
		if (!("breadth" in config)) return false;
		if (!("depth" in config)) return false;
		if (!("digits" in config)) return false;
		document.body.classList.add("run");
		const repeatRes: Array<benchmarkRecord[][]> = [];
		let benchDurationSum = 0;
		for (let rep = 0; rep <= config.repeats; rep++) {
			const benchRes: benchmarkRecord[][] = this.allocResultArray(config.runs, config.workerAmount);
			await this.#postMessageBinaryObject.init(config.workerAmount);
			// benchmark
			const benchStart = performance.now();
			for (let r = 0; r < config.runs; r++) {
				const runRes = benchRes[r];
				await this.#postMessageBinaryObject.benchmark(runRes, config.workerRandomDispatch, config.breadth!, config.depth!, config.digits!);
			}
			const benchEnd = performance.now();
			const duration = benchEnd - benchStart;
			benchDurationSum += duration;
			await this.#postMessageBinaryObject.teardown();
			const groupedWorkers = Object.values(Object.groupBy(benchRes.flat(1), ({ workerIdx }) => workerIdx));
			repeatRes.push(groupedWorkers as benchmarkRecord[][]);
		}
		const shape = this.formatShape(config.breadth!, config.depth!, config.digits!);
		const datetime = this.currentDate();
		this.logBenchmarkTable(
			repeatRes,
			`${this.formatDate(datetime)}_PostMessage_Binary_Object_${shape.replaceAll(" ", "")}_${config.repeats}Repeats_${
				config.workerAmount
			}Workers_${config.runs}Runs_${config.workerRandomDispatch ? "Shuffled" : "Serial"}Dispatch`,
			config
		);
		this.logResult(
			`<span class="time-label">${datetime}</span><br>PostMessage Binary Object - ${shape}, ${config.repeats} Repeats, ${
				config.workerAmount
			} Workers, ${config.runs} Runs, Average Test Time: ${(benchDurationSum / (config.repeats + 1)).toFixed(3)} ms`
		);
		this.logDivider();
		document.body.classList.remove("run");
		return true;
	}

	async testAtomicsBinaryObject(config: testConfig) {
		if (!this.#featureTestWaitAsync()) return false;
		if (!("breadth" in config)) return false;
		if (!("depth" in config)) return false;
		if (!("digits" in config)) return false;
		const bufferSize = JSON.stringify(generateStringObject(config.breadth!, config.depth!, config.digits!)).length;
		document.body.classList.add("run");
		const repeatRes: Array<benchmarkRecord[][]> = [];
		let benchDurationSum = 0;
		for (let rep = 0; rep <= config.repeats; rep++) {
			const benchRes: benchmarkRecord[][] = this.allocResultArray(config.runs, config.workerAmount);
			await this.#atomicsBinaryObject.init(bufferSize, config.workerAmount);
			// benchmark
			const benchStart = performance.now();
			for (let r = 0; r < config.runs; r++) {
				const runRes = benchRes[r];
				await this.#atomicsBinaryObject.benchmark(runRes, config.workerRandomDispatch, config.breadth!, config.depth!, config.digits!);
			}
			const benchEnd = performance.now();
			const duration = benchEnd - benchStart;
			benchDurationSum += duration;
			await this.#atomicsBinaryObject.teardown();
			const groupedWorkers = Object.values(Object.groupBy(benchRes.flat(1), ({ workerIdx }) => workerIdx));
			repeatRes.push(groupedWorkers as benchmarkRecord[][]);
		}
		const shape = this.formatShape(config.breadth!, config.depth!, config.digits!);
		const datetime = this.currentDate();
		this.logBenchmarkTable(
			repeatRes,
			`${this.formatDate(datetime)}_Atomics_Binary_Object_${shape.replaceAll(" ", "")}_${config.repeats}Repeats_${config.workerAmount}Workers_${
				config.runs
			}Runs_${config.workerRandomDispatch ? "Shuffled" : "Serial"}Dispatch`,
			config
		);
		this.logResult(
			`<span class="time-label">${datetime}</span><br>Atomics Binary Object - ${shape}, ${config.repeats} Repeats, ${
				config.workerAmount
			} Workers, ${config.runs} Runs, Average Test Time: ${(benchDurationSum / (config.repeats + 1)).toFixed(3)} ms`
		);
		this.logDivider();
		document.body.classList.remove("run");
		return true;
	}

	async testPostMessageFloatObject(config: testConfig) {
		if (!("floatAmount" in config)) return false;
		if (!("randomKeys" in config)) return false;
		document.body.classList.add("run");
		const repeatRes: Array<benchmarkRecord[][]> = [];
		let benchDurationSum = 0;
		for (let rep = 0; rep <= config.repeats; rep++) {
			const benchRes: benchmarkRecord[][] = this.allocResultArray(config.runs, config.workerAmount);
			await this.#postMessageFloatObject.init(config.workerAmount);
			// benchmark
			const benchStart = performance.now();
			for (let r = 0; r < config.runs; r++) {
				const runRes = benchRes[r];
				await this.#postMessageFloatObject.benchmark(runRes, config.workerRandomDispatch, config.floatAmount!, config.randomKeys!);
			}
			const benchEnd = performance.now();
			const duration = benchEnd - benchStart;
			benchDurationSum += duration;
			await this.#postMessageFloatObject.teardown();
			const groupedWorkers = Object.values(Object.groupBy(benchRes.flat(1), ({ workerIdx }) => workerIdx));
			repeatRes.push(groupedWorkers as benchmarkRecord[][]);
		}
		const datetime = this.currentDate();
		this.logBenchmarkTable(
			repeatRes,
			`${this.formatDate(datetime)}_PostMessage_Float_Object_Copy_${config.floatAmount}Floats_${config.repeats}Repeats_${
				config.workerAmount
			}Workers_${config.runs}Runs_${config.workerRandomDispatch ? "Shuffled" : "Serial"}Dispatch_${
				config.randomKeys ? "Random" : "Deterministic"
			}Keys`,
			config
		);
		this.logResult(
			`<span class="time-label">${datetime}</span><br>PostMessage Float Object Copy - ${config.floatAmount} Floats, ${
				config.randomKeys ? "Random" : "Deterministic"
			} Keys, ${config.repeats} Repeats, ${config.workerAmount} Workers, ${config.runs} Runs, Average Test Time: ${(
				benchDurationSum /
				(config.repeats + 1)
			).toFixed(3)} ms`
		);
		this.logDivider();
		document.body.classList.remove("run");
		return true;
	}

	async testPostMessageFloatArray(config: testConfig) {
		if (!("floatAmount" in config)) return false;
		document.body.classList.add("run");
		const repeatRes: Array<benchmarkRecord[][]> = [];
		let benchDurationSum = 0;
		for (let rep = 0; rep <= config.repeats; rep++) {
			const benchRes: benchmarkRecord[][] = this.allocResultArray(config.runs, config.workerAmount);
			await this.#postMessageFloatArray.init(config.workerAmount);
			// benchmark
			const benchStart = performance.now();
			for (let r = 0; r < config.runs; r++) {
				const runRes = benchRes[r];
				await this.#postMessageFloatArray.benchmark(runRes, config.workerRandomDispatch, config.floatAmount!);
			}
			const benchEnd = performance.now();
			const duration = benchEnd - benchStart;
			benchDurationSum += duration;
			await this.#postMessageFloatArray.teardown();
			const groupedWorkers = Object.values(Object.groupBy(benchRes.flat(1), ({ workerIdx }) => workerIdx));
			repeatRes.push(groupedWorkers as benchmarkRecord[][]);
		}
		const datetime = this.currentDate();
		this.logBenchmarkTable(
			repeatRes,
			`${this.formatDate(datetime)}_PostMessage_Float_Array_Copy_${config.floatAmount}Floats_${config.repeats}Repeats_${
				config.workerAmount
			}Workers_${config.runs}Runs_${config.workerRandomDispatch ? "Shuffled" : "Serial"}Dispatch`,
			config
		);
		this.logResult(
			`<span class="time-label">${datetime}</span><br>PostMessage Float Array Copy - ${config.floatAmount} Floats, ${config.repeats} Repeats, ${
				config.workerAmount
			} Workers, ${config.runs} Runs, Average Test Time: ${(benchDurationSum / (config.repeats + 1)).toFixed(3)} ms`
		);
		this.logDivider();
		document.body.classList.remove("run");
		return true;
	}

	async testAtomicsFloatArray(config: testConfig) {
		if (!this.#featureTestWaitAsync()) return false;
		if (!("floatAmount" in config)) return false;
		document.body.classList.add("run");
		const repeatRes: Array<benchmarkRecord[][]> = [];
		let benchDurationSum = 0;
		for (let rep = 0; rep <= config.repeats; rep++) {
			const benchRes: benchmarkRecord[][] = this.allocResultArray(config.runs, config.workerAmount);
			await this.#atomicsFloatArray.init(config.floatAmount!, config.workerAmount);
			// benchmark
			const benchStart = performance.now();
			for (let r = 0; r < config.runs; r++) {
				const runRes = benchRes[r];
				await this.#atomicsFloatArray.benchmark(runRes, config.workerRandomDispatch, config.floatAmount!);
			}
			const benchEnd = performance.now();
			const duration = benchEnd - benchStart;
			benchDurationSum += duration;
			await this.#atomicsFloatArray.teardown();
			const groupedWorkers = Object.values(Object.groupBy(benchRes.flat(1), ({ workerIdx }) => workerIdx));
			repeatRes.push(groupedWorkers as benchmarkRecord[][]);
		}
		const datetime = this.currentDate();
		this.logBenchmarkTable(
			repeatRes,
			`${this.formatDate(datetime)}_Atomics_Float_Array_${config.floatAmount}Floats_${config.repeats}Repeats_${config.workerAmount}Workers_${
				config.runs
			}Runs_${config.workerRandomDispatch ? "Shuffled" : "Serial"}Dispatch`,
			config
		);
		this.logResult(
			`<span class="time-label">${datetime}</span><br>Atomics Float Array - ${config.floatAmount} Floats, ${config.repeats} Repeats, ${
				config.workerAmount
			} Workers, ${config.runs} Runs, Average Test Time: ${(benchDurationSum / (config.repeats + 1)).toFixed(3)} ms`
		);
		this.logDivider();
		document.body.classList.remove("run");
		return true;
	}

	async testPostMessageLatency(config: testConfig) {
		document.body.classList.add("run");
		const repeatRes: Array<benchmarkRecord[][]> = [];
		let benchDurationSum = 0;
		for (let rep = 0; rep <= config.repeats; rep++) {
			const benchRes: benchmarkRecord[][] = this.allocResultArray(config.runs, config.workerAmount);
			await this.#postMessageLatency.init(config.workerAmount);
			// benchmark
			const benchStart = performance.now();
			for (let r = 0; r < config.runs; r++) {
				const runRes = benchRes[r];
				await this.#postMessageLatency.benchmark(runRes, config.workerRandomDispatch);
			}
			const benchEnd = performance.now();
			const duration = benchEnd - benchStart;
			benchDurationSum += duration;
			await this.#postMessageLatency.teardown();
			const groupedWorkers = Object.values(Object.groupBy(benchRes.flat(1), ({ workerIdx }) => workerIdx));
			repeatRes.push(groupedWorkers as benchmarkRecord[][]);
		}
		const datetime = this.currentDate();
		this.logBenchmarkTable(
			repeatRes,
			`${this.formatDate(datetime)}_PostMessage_Latency_${config.repeats}Repeats_${config.workerAmount}Workers_${config.runs}Runs_${
				config.workerRandomDispatch ? "Shuffled" : "Serial"
			}Dispatch`,
			config
		);
		this.logResult(
			`<span class="time-label">${datetime}</span><br>PostMessage Latency - ${config.repeats} Repeats, ${config.workerAmount} Workers, ${
				config.runs
			} Runs, Average Test Time: ${(benchDurationSum / (config.repeats + 1)).toFixed(3)} ms`
		);
		this.logDivider();
		document.body.classList.remove("run");
		return true;
	}

	async testAtomicsLatency(config: testConfig) {
		if (!this.#featureTestWaitAsync()) return false;
		document.body.classList.add("run");
		const repeatRes: Array<benchmarkRecord[][]> = [];
		let benchDurationSum = 0;
		for (let rep = 0; rep <= config.repeats; rep++) {
			const benchRes: benchmarkRecord[][] = this.allocResultArray(config.runs, config.workerAmount);
			await this.#atomicsLatency.init(config.workerAmount);
			// benchmark
			const benchStart = performance.now();
			for (let r = 0; r < config.runs; r++) {
				const runRes = benchRes[r];
				await this.#atomicsLatency.benchmark(runRes, config.workerRandomDispatch);
			}
			const benchEnd = performance.now();
			const duration = benchEnd - benchStart;
			benchDurationSum += duration;
			await this.#atomicsLatency.teardown();
			const groupedWorkers = Object.values(Object.groupBy(benchRes.flat(1), ({ workerIdx }) => workerIdx));
			repeatRes.push(groupedWorkers as benchmarkRecord[][]);
		}
		const datetime = this.currentDate();
		this.logBenchmarkTable(
			repeatRes,
			`${this.formatDate(datetime)}_Atomics_Latency_${config.repeats}Repeats_${config.workerAmount}Workers_${config.runs}Runs_${
				config.workerRandomDispatch ? "Shuffled" : "Serial"
			}Dispatch`,
			config
		);
		this.logResult(
			`<span class="time-label">${datetime}</span><br>Atomics Latency - ${config.repeats} Repeats, ${config.workerAmount} Workers, ${
				config.runs
			} Runs, Average Test Time: ${(benchDurationSum / (config.repeats + 1)).toFixed(3)} ms`
		);
		this.logDivider();
		document.body.classList.remove("run");
		return true;
	}

	async testPostMessageSpeed(config: testConfig) {
		document.body.classList.add("run");
		const repeatRes: Array<benchmarkRecord[][]> = [];
		let benchDurationSum = 0;
		for (let rep = 0; rep <= config.repeats; rep++) {
			const benchRes: benchmarkRecord[][] = this.allocResultArray(config.runs, config.workerAmount);
			await this.#postMessageSpeed.init(config.workerAmount);
			// benchmark
			const benchStart = performance.now();
			await this.#postMessageSpeed.benchmark(benchRes, config.workerRandomDispatch, config.runs);
			const benchEnd = performance.now();
			const duration = benchEnd - benchStart;
			benchDurationSum += duration;
			await this.#postMessageSpeed.teardown();
			const groupedWorkers = Object.values(Object.groupBy(benchRes.flat(1), ({ workerIdx }) => workerIdx));
			repeatRes.push(groupedWorkers as benchmarkRecord[][]);
		}
		const datetime = this.currentDate();
		this.logBenchmarkTable(
			repeatRes,
			`${this.formatDate(datetime)}_PostMessage_Speed_${config.repeats}Repeats_${config.workerAmount}Workers_${config.runs}Runs_${
				config.workerRandomDispatch ? "Shuffled" : "Serial"
			}Dispatch`,
			config
		);
		this.logResult(
			`<span class="time-label">${datetime}</span><br>PostMessage Speed - ${config.repeats} Repeats, ${config.workerAmount} Workers, ${
				config.runs
			} Runs, Average Test Time: ${(benchDurationSum / (config.repeats + 1)).toFixed(3)} ms`
		);
		this.logDivider();
		document.body.classList.remove("run");
		return true;
	}

	async testAtomicsSpeed(config: testConfig) {
		if (!this.#featureTestWaitAsync()) return false;
		document.body.classList.add("run");
		const repeatRes: Array<benchmarkRecord[][]> = [];
		let benchDurationSum = 0;
		for (let rep = 0; rep <= config.repeats; rep++) {
			const benchRes: benchmarkRecord[][] = this.allocResultArray(config.runs, config.workerAmount);
			await this.#atomicsSpeed.init(config.workerAmount);
			// benchmark
			const benchStart = performance.now();
			await this.#atomicsSpeed.benchmark(benchRes, config.workerRandomDispatch, config.runs);
			const benchEnd = performance.now();
			const duration = benchEnd - benchStart;
			benchDurationSum += duration;
			await this.#atomicsSpeed.teardown();
			const groupedWorkers = Object.values(Object.groupBy(benchRes.flat(1), ({ workerIdx }) => workerIdx));
			repeatRes.push(groupedWorkers as benchmarkRecord[][]);
		}
		const datetime = this.currentDate();
		this.logBenchmarkTable(
			repeatRes,
			`${this.formatDate(datetime)}_Atomics_Speed_${config.repeats}Repeats_${config.workerAmount}Workers_${config.runs}Runs_${
				config.workerRandomDispatch ? "Shuffled" : "Serial"
			}Dispatch`,
			config
		);
		this.logResult(
			`<span class="time-label">${datetime}</span><br>Atomics Speed - ${config.repeats} Repeats, ${config.workerAmount} Workers, ${
				config.runs
			} Runs, Average Test Time: ${(benchDurationSum / (config.repeats + 1)).toFixed(3)} ms`
		);
		this.logDivider();
		document.body.classList.remove("run");
		return true;
	}
}

document.addEventListener("DOMContentLoaded", () => {
	new Benchmark();
});
