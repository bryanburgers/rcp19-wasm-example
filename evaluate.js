/**
 * @module evaluate
 *
 * Evaluates RCP19 expressions by instantiating and calling a WebAssembly
 * module.
 *
 * A large part of the work here is string marshalling. WebAssembly doesn't know
 * about strings and the way WebAssembly deals with strings is by using the
 * exported memory, pointers, and lengths (not too unlike C).
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

/**
 * Evaluate an RCP19 expression against a resource (and, potentially, the
 * previous value of that resource)
 *
 * @async
 * @function evaluate
 * @param {string} expression – The RCP19 expression
 * @param {Object} value – The listing data, member data, or other resource data
 *   to evaluate the expression against
 * @param {Object} previousValue – The previous resource data to use. This is
 *   used when the expression uses `LAST` syntax
 * @returns {*} The result of the evaluation. This could be any valid output
 *   type from an RCP19 expression
 * @throws {Error} If the expression could not be parsed or the evaluation fails
 */
async function evaluate(expression, value, previousValue) {
  // Load the WebAssembly module
  const module = await loadModule();

  // Declare the object that the WebAssembly module will set when it is finished
  // running.
  let outputStr;
  // Declare the WebAssembly instance memory. There's this weird circular
  // dependency going on here: the function that the WebAssembly instance will
  // import needs to know about the memory, but the memory isn't available until
  // after the WebAssembly instance is ready.
  let memory;

  // Imports to the WebAssembly instance
  //
  // These are things that the host (this Javascript) makes available to the
  // WebAssembly module. All WebAssembly imports use a two-layer name; one is
  // the namespace and the other is the name of the item (in our case, the name
  // of the function).
  //
  // Our WebAssembly module expects one import, a function called
  // `evaluator:output` that will get called when the WebAssembly module is
  // almost done and has generated a string for us to use.
  const imports = {
    // `evaluator` namespace
    evaluator: {
      // `evaluator:output` function
      //
      // This function is sent a pointer and a length for some string. It's the
      // Javascript's responsiblity to look into the WebAssembly instance's
      // memory and interpret the data at that pointer as a string.
      output: (outputPtr, outputLen) => {
        // Get a byte slice pointing to the WebAssembly's memory at the
        // particular location it told us the JSON blob (as a string) was
        // placed.
        const outputMem = new Uint8Array(memory.buffer, outputPtr, outputLen);
        // And decode that memory as a UTF-8 string.
        outputStr = new TextDecoder().decode(outputMem);
      },
    },
  };

  // Instantiate the module!
  const instance = await WebAssembly.instantiate(module, imports);
  // Get the functions that the instance has exported for us to use.
  const { alloc, free, run } = instance.exports;
  // Memory was declared previously because of the circular dependency. Set it
  // now.
  memory = instance.exports.memory;

  // The WebAssembly module expects us to create a single JSON blob that
  // contains all of the inputs, serialize it as a string, write it to the
  // instance's memory, and call the `run` function with the location of that
  // string.

  // So first create the JSON
  const now = new Date();
  const inputJson = {
    expression,
    value: value !== undefined ? value : null,
    previousValue,
    now: now.toISOString(),
    date: nowToDate(now),
  };
  // Turn it into a Javascript string.
  const inputStr = JSON.stringify(inputJson);
  // And encode it as UTF-8 bytes.
  const encoder = new TextEncoder();
  const bytes = encoder.encode(inputStr);

  // Now ask the WebAssembly instance for some space in its memory to write
  // those bytes, and then write them to that space.
  const inputPtr = alloc(bytes.length);
  const inputLen = bytes.length;
  const inputMem = new Uint8Array(memory.buffer, inputPtr, inputLen);
  inputMem.set(bytes);

  // Now call the all-important `run` function that is exported from the
  // WebAssembly instance to actually do work! Because it's very difficult to
  // *return* a string here, the WebAssembly instance will instead call the
  // `evaluator:output` function we defined earlier when it's done.
  // Side-effects!
  run(inputPtr, inputLen);
  // Yay! It's done! Now free the memory we asked for.
  free(inputPtr, inputLen);

  // Turn the JSON blob string that the WebAssembly instance returned into an
  // actual Javascript object.
  const output = JSON.parse(outputStr);

  // And return it idiomatically! If the WebAssembly instance indicated that
  // there was an error, throw it.
  if (output.error) {
    throw new Error(output.error);
  }

  // Otherwise return the value it produced.
  return output.data;
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

module.exports = evaluate;
