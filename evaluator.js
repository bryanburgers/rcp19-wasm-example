/**
 * @module evaluator
 *
 * If you want well-documented, read through `evaluate.js` instead.
 *
 * This module creates an instance that can stick around to evaluate more than
 * one rule, and can do it without `async`. But to get that, it's a little more
 * confusing to follow and so this module is more about what's possible and less
 * about describing how everything works.
 */

const fs = require("fs");

// Load the WebAssembly file.
let file;
try {
  file = fs.readFileSync("evaluator.wasm");
} catch (err) {
  throw new Error(
    "Could not find evaluator.wasm; you probably need to build it first. See the README.md or the Makefile."
  );
}

// Load the module. We really only need to do this once, so cache the result.
let modulePromise;
function loadModule() {
  if (modulePromise) {
    return modulePromise;
  }

  modulePromise = WebAssembly.compile(file);
  return modulePromise;
}

class Evaluator {
  // The instance, once it's instantiated. This should always be set, as long
  // as the caller used `Evaluator.create()`
  _instance = null;
  // The instance's memory
  _memory = null;
  // A holding location for the JSON blob string that was generated
  _outputStr = null;

  static async create() {
    const self = new Evaluator();

    const module = await loadModule();
    const imports = {
      evaluator: {
        output: (outputPtr, outputLen) => {
          const outputMem = new Uint8Array(
            self._memory.buffer,
            outputPtr,
            outputLen
          );
          self._outputStr = new TextDecoder().decode(outputMem);
        },
      },
    };
    self._instance = await WebAssembly.instantiate(module, imports);
    self._memory = self._instance.exports.memory;

    return self;
  }

  evaluate(expression, value, previousValue) {
    const { alloc, free, run } = this._instance.exports;

    const now = new Date();
    const inputJson = {
      expression,
      value: value !== undefined ? value : null,
      previousValue,
      now: now.toISOString(),
      date: nowToDate(now),
    };
    const inputStr = JSON.stringify(inputJson);
    const encoder = new TextEncoder();
    const bytes = encoder.encode(inputStr);

    const inputPtr = alloc(bytes.length);
    const inputLen = bytes.length;
    const inputMem = new Uint8Array(this._memory.buffer, inputPtr, inputLen);
    inputMem.set(bytes);

    run(inputPtr, inputLen);
    free(inputPtr, inputLen);

    const output = JSON.parse(this._outputStr);
    this._outputStr = null;

    if (output.error) {
      throw new Error(output.error);
    }

    return output.data;
  }
}

/**
 * Given a Date, turn that into a local date string in the format `1985-04-21`
 * @param {Date} now
 * @returns {String} the date, as a string
 */
function nowToDate(now) {
  // Lazy.
  const months = [
    "01",
    "02",
    "03",
    "04",
    "05",
    "06",
    "07",
    "08",
    "09",
    "10",
    "11",
    "12",
  ];
  const days = [
    "00",
    "01",
    "02",
    "03",
    "04",
    "05",
    "06",
    "07",
    "08",
    "09",
    "10",
    "11",
    "12",
    "13",
    "14",
    "15",
    "16",
    "17",
    "18",
    "19",
    "20",
    "21",
    "22",
    "23",
    "24",
    "25",
    "26",
    "27",
    "28",
    "29",
    "30",
    "31",
  ];

  return `${now.getFullYear()}-${months[now.getMonth()]}-${
    days[now.getDate()]
  }`;
}

module.exports = {
  Evaluator,
};
