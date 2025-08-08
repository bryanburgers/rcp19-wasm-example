//! Everything required to deal with WebAssembly!
//!
//! WebAssembly modules are very primitive. The functions they export only support a very limited
//! number of input types which are mostly ints and floats.
//!
//! Notably, there is no way to pass strings of any sort to WebAssembly.
//!
//! But WebAssembly modules in general (and our module in particular) needs to deal with strings.
//! The common way to do this that WebAssembly modules also make their *inner memory* available.
//!
//! So a large part of this code is simply dealing with making it possible for Javascript to tell
//! the WebAssembly module "Hey, I have a string! Where should I put it?" and for the WebAssembly
//! module to tell the Javascript "Hey, I did what you asked and now I have a string to give you! I
//! put it here!"
//!
//! For Javascript to tell WebAssembly about a string, it must first call `alloc` with the length of
//! the string. That gives back a pointer into memory which Javascript can write to. Later, the
//! Javascript needs to call `free` to deallocate that memory. (Sound like C? You bet.)
//!
//! For WebAssembly to tell Javascript about a string, we'll have WebAssembly look for an imported
//! function called `evaluate:output` that the Javascript will provide when calling the module. When
//! the WebAssembly has a string it wants to send, it will put this string in a specific place in
//! memory and then call the imported function with the pointer and length of the string.
//!
//! Yep, lots of string marshalling.
//!
//! Because we don't want to do this string marshalling a bunch of times, the interface will be that
//! the WebAssembly module takes a single string: a JSON blob of everything it needs. And the
//! WebAssembly module will output a single string: a JSON blob of the response, whether it was a
//! success or an error.

use chrono::{DateTime, FixedOffset, NaiveDate};
use serde::{Deserialize, Serialize};

/// The top-level module handler
///
/// This is not exported by the WebAssembly module, but it's the top-level function doing some of
/// the marshalling.
fn top_level(input: &[u8]) -> ResponseJson {
    // Check that it's a valid UTF-8 string.
    let input = match std::str::from_utf8(input) {
        Ok(input) => input,
        Err(err) => {
            return ResponseJson::error(format!("Input is not valid utf8: {err}"));
        }
    };

    // Parse the JSON into our strongly-typed RequestJson struct
    let request = match serde_json::from_str::<RequestJson>(input) {
        Ok(input) => input,
        Err(err) => {
            return ResponseJson::error(format!("Input is not in the correct json format: {err}"));
        }
    };

    // And then do the real work
    match super::evaluate_expression(
        request.expression,
        request.value,
        request.previous_value,
        request.now,
        request.date,
    ) {
        Ok(data) => ResponseJson::success(data),
        Err(err) => ResponseJson::error(err),
    }
}

/// The definition of the JSON blob that the Javascript side sends
#[derive(Deserialize)]
struct RequestJson {
    /// The RCP19 expression
    expression: String,
    /// JSON representing the data to be evaluated
    value: serde_json::Value,
    /// JSON representing the data as it was previously, used in expressions like `[LAST FieldName]`
    #[serde(rename = "previousValue")]
    previous_value: Option<serde_json::Value>,
    /// The current timestamp, in UTC
    ///
    /// Wasm is completely sandboxed, which means it doesn't have a way to even get the current time
    /// from the environment. So the current time must be sent in.
    now: DateTime<FixedOffset>,
    /// The current date, in the local timezone
    ///
    /// Wasm is completely sandboxed, which means it doesn't have a way to even get the current date
    /// from the environment. So the current date must be sent in.
    ///
    /// This can't be derived from `now` without knowing the timezone. Instead of dealing with
    /// timezones in the wasm module, we'll just pass in the current date in local time and let the
    /// Javascript side deal with timezones.
    date: NaiveDate,
}

/// The definition of the JSON blob that we send back to the Javascript
#[derive(Serialize)]
struct ResponseJson {
    /// If the expression succeeded, the JSON data that the expression produced
    data: Option<serde_json::Value>,
    /// If the expression failed, the error string to return
    error: Option<String>,
}

impl ResponseJson {
    /// Create a ResponseJson with only the `data` field populated
    pub fn success(data: serde_json::Value) -> Self {
        Self {
            data: Some(data),
            error: None,
        }
    }
    /// Create a ResponseJson with only the `error` field populated
    pub fn error(string: String) -> Self {
        Self {
            data: None,
            error: Some(string),
        }
    }
}

// The functions imported by WebAssembly from Javascript.
//
// Wasm uses a two-level name system for imports, so every function has a single-level namespace and
// then a function name. We'll call the namespace "evaluator".
#[link(wasm_import_module = "evaluator")]
unsafe extern "C" {
    /// The function to call when the WebAssembly module needs to send a string to Javascript.
    ///
    /// The WebAssembly will only call this once, always at the end of its execution, and the
    /// Javascript is expected to pull the data out of memory immediately upon handling this call.
    unsafe fn output(str_start: *const u8, str_len: usize);
}

/// Run the evaluation!
///
/// The input is a pointer and length to a string that contains the JSON blob. Javascript is
/// expected to have called [alloc] to generate space for the string, and then provided that pointer
/// and length here.
#[unsafe(no_mangle)]
pub extern "C" fn run(ptr: *mut u8, len: usize) {
    // We need to trust that the Javascript has allocated a buffer, written to it, and used that
    // information to send us the data.
    let slice = unsafe { std::slice::from_raw_parts(ptr, len) };

    // Do the actual work
    let response = top_level(slice);

    // Now that we have a response, we need to do the whole wasm->javascript dance in reverse.
    // Create a string with the JSON payload we're going to return.
    let string = serde_json::to_string(&response).unwrap();
    // Because Rust doesn't allow returning both a pointer and a length (multi-valued returns) from
    // Webassembly, we're instead going to call an imported function with the pointer and the length
    // and expect the Javascript side to give us this function.
    unsafe { output(string.as_ptr(), string.len()) };
}

/// Create space to put a string.
///
/// The Javascript side calls this so that it has a place to put the JSON blob. It then fills the
/// memory provided using a TextEncoder to make sure the JSON blob is encoded as UTF-8.
#[unsafe(no_mangle)]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut buf = Vec::with_capacity(len);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

/// Free the memory that was created with [alloc].
///
/// The Javascript side should call this after calling [run] when the input blob is no longer
/// needed.
#[unsafe(no_mangle)]
pub extern "C" fn free(ptr: *mut u8, len: usize) {
    unsafe { drop(Vec::from_raw_parts(ptr, len, len)) }
}
