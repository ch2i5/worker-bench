export type benchmarkRecord = { workerIdx: number; roundtrip: number; toWorker: number; fromWorker: number };

export enum WorkerIndices {
	MAIN_INDEX,
	WORKER_INDEX,
}

export enum WorkerState {
	WAIT,
	WAKE_UP,
	TERMINATE,
}

export function randomKey(len: number) {
	return new Array(len)
		.fill(0)
		.map(() => Math.floor(Math.random() * 16).toString(16))
		.join("");
}

export function generateStringObject(breadth: number, depth: number, len = 16, randomizeKey = true) {
	if (depth === 0) {
		return randomKey(len);
	}
	const r: any = {};
	for (let i = 0; i < breadth; i++) {
		const k = randomizeKey
			? randomKey(len)
			: `${breadth.toString().padStart(Math.ceil(len / 2) - 1, "0")}-${depth.toString().padStart(Math.floor(len / 2), "0")}`;

		r[k] = generateStringObject(breadth, depth - 1, len);
	}
	return r;
}

export function generateFloatObject(breadth: number, depth: number, len = 16, randomizeKey = true) {
	if (depth === 0) {
		return Math.random();
	}
	const r: any = {};
	for (let i = 0; i < breadth; i++) {
		const k = randomizeKey
			? randomKey(len)
			: `${breadth.toString().padStart(Math.ceil(len / 2) - 1, "0")}-${depth.toString().padStart(Math.floor(len / 2), "0")}`;
		r[k] = generateFloatObject(breadth, depth - 1, len);
	}
	return r;
}

export function h(type: string, props: Object | null = null, ...children: Array<Element | string>) {
	const element: HTMLElement = document.createElement(type);
	if (props) {
		for (let [k, v] of Object.entries(props)) {
			if (v === "") continue;
			switch (k) {
				case "class":
					const classes = v.split(" ");
					for (let className of classes) {
						element.classList.add(className);
					}
					break;
				case "attributes":
					const attributes: string[] = Object.keys(v);
					for (let attribute of attributes) {
						element.setAttribute(attribute, v[attribute]);
					}
					break;
				case "dataset":
					const dataKeys: string[] = Object.keys(v);
					for (let dataKey of dataKeys) {
						element.dataset[dataKey] = v[dataKey];
					}
					break;
				case "text":
					element.textContent = v;
					break;
				case "innerHTML":
					element.innerHTML = v;
					break;
				case "events":
					const events: string[] = Object.keys(v);
					const pointerTolerance = 40;
					let cancelClick = false;
					for (let event of events) {
						switch (event) {
							case "primaryClick":
								{
									let pointer: { id: number; x: number; y: number } = {
										id: 0,
										x: 0,
										y: 0,
									};
									element.addEventListener("pointerdown", (p: PointerEvent) => {
										pointer.id = p.pointerId;
										pointer.x = p.clientX;
										pointer.y = p.clientY;
										cancelClick = false;
									});
									element.addEventListener("pointerup", (p: PointerEvent) => {
										if (cancelClick) return;
										if (
											pointer.id === p.pointerId &&
											p.clientX < pointer.x + pointerTolerance &&
											p.clientX > pointer.x - pointerTolerance &&
											p.clientY < pointer.y + pointerTolerance &&
											p.clientY > pointer.y - pointerTolerance
										) {
											if (p.pointerType !== "mouse") {
												v[event](p);
												return;
											}
											if (p.button === 0) {
												v[event](p);
											}
										}
									});
								}
								break;
							case "hold":
								{
									let pointer: { id: number; x: number; y: number; timeStamp: number } = {
										id: 0,
										x: 0,
										y: 0,
										timeStamp: 0,
									};
									let holdTimeout: number;
									element.addEventListener("pointerdown", (p: PointerEvent) => {
										pointer.id = p.pointerId;
										pointer.x = p.clientX;
										pointer.y = p.clientY;
										pointer.timeStamp = p.timeStamp;
										holdTimeout = window.setTimeout(() => {
											cancelClick = true;
											if (
												p.clientX < pointer.x + pointerTolerance &&
												p.clientX > pointer.x - pointerTolerance &&
												p.clientY < pointer.y + pointerTolerance &&
												p.clientY > pointer.y - pointerTolerance
											) {
												if (Array.isArray(v[event])) {
													v[event][0](p);
												} else {
													v[event](p);
												}
											}
										}, 900);
									});
									// element.addEventListener("pointermove", (p: PointerEvent) => {
									// 	//
									// });
									element.addEventListener("pointerup", (p: PointerEvent) => {
										if (pointer.id === p.pointerId) {
											clearTimeout(holdTimeout);
											if (Array.isArray(v[event])) {
												v[event][1](p);
											}
										}
									});
								}
								break;
							default:
								element.addEventListener(event, v[event]);
						}
					}
					break;
				case "for":
				case "type":
				default:
					element.setAttribute(k, v);
					break;
			}
		}
	}
	for (let c of children) {
		if (typeof c === "string") {
			element.appendChild(document.createTextNode(c));
			continue;
		}
		element.appendChild(c);
	}
	return element;
}
