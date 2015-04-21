# exitcheck
A utility for solving a hyper specific version of the halting problem in Node.js code. By default only looks for calls to `exit()` (with or without parameters), *not* `process.exit()`. 