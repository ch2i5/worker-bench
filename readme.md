# workerBench

This benchmark suite was created as part of the bachelor's thesis "Achieving Low Latency and High Throughput in Real-Time Web Applications Using Web Workers".
The thesis can be found [here](https://github.com/ch2i5/worker-bench/blob/main/public/Achieving_Low_Latency_and_High_Throughput_in_Real_Time_Web_Applications_Using_Web_Workers.pdf).
Raw data and generated plots are provided at [https://github.com/ch2i5/worker-bench-results](https://github.com/ch2i5/worker-bench-results).

The goal of this benchmark suite is to research transmission latency and throughput charactersitics in client-side real-time web applications using web workers. This is a first rudimentary implementation that was created during the two-month thesis time limit and could use some refactoring.

Get up and running with the following steps:

1. clone the git repo
2. npm install
3. npm run build
4. docker compose up -d
5. visit localhost

You can dispatch tests automcatically (without the GUI) by either supplying the "testconfig" or "testplan" URL parameter:

| Type       | URL Parameter Example                                                                                                                                                              |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Testconfig | ?testconfig=[{%22test%22:%22postMessageBlobCopy%22,%22repeats%22:0%22workerAmount%22:2,%22runs%22:100,%22randomDispatchOrder%22:false,%22payloadSize%22:2048,%22download%22:true}] |
| Testplan   | ?testplan=http%3A%2F%2Flocalhost%2FfloatTestplan.json                                                                                                                              |

Valid config parameters are:

| Parameter Name       | Data Type | Options / Description                                                                                                                                                                                                                                                |
| -------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| test                 | string    | atomicsBlob, postMessageBlobCopy, postMessageBlobTransfer, atomicsBinaryObject, postMessageBinaryObject, postMessageObjectCopy, atomicsFloatArray, postMessageFloatArray, postMessageFloatObject, atomicsLatency, postMessageLatency, atomicsSpeed, postMessageSpeed |
| repeats              | number    | 0..n (max. 5 recommended)                                                                                                                                                                                                                                            |
| workerAmount         | number    | 1..n (e.g. 1, 2, 3, etc.)                                                                                                                                                                                                                                            |
| workerRandomDispatch | boolean   | Shuffle Worker dispatch order before each run?                                                                                                                                                                                                                       |
| runs                 | number    | 1..n (e.g. 500)                                                                                                                                                                                                                                                      |
| payloadSize          | number    | Number of Bytes: 1..n (e.g. 1024)                                                                                                                                                                                                                                    |
| breadth              | number    | 1..6                                                                                                                                                                                                                                                                 |
| depth                | number    | 1..6                                                                                                                                                                                                                                                                 |
| digits               | number    | 1..n (Default: 16)                                                                                                                                                                                                                                                   |
| randomKeys           | boolean   | Randomize keys of tests with Objects?                                                                                                                                                                                                                                |
| floatAmount          | number    | 1..n (e.g. 100)                                                                                                                                                                                                                                                      |
| download             | boolean   | Auto-download CSV-File after test?                                                                                                                                                                                                                                   |
| visualizeResults     | boolean   | Show plot of all runs?                                                                                                                                                                                                                                               |
| csvEndpoint          | string    | If set, CSV-File will be PUT to URL                                                                                                                                                                                                                                  |
