An example of calling the [rets_expression] Rust crate from Node via WebAssembly

## tl;dr

Evaluate RCP19 expressions in Node.js!

```bash
# Install rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Allow rust to compile to WebAssembly
rustup target add wasm32-unknown-unknown
# Build the WebAssembly module
make
# Evaluate RCP19 expressions in node!
node index.js
```

## How it works

This example has a WebAssembly side (which is implemented in Rust) and a Node.js
side.

The WebAssembly side is a small shim over the open-source MIT-licensed
[rets_expression] library that is available on [crates.io] (the Rust equivalent
of npmjs.com) to evaluate the expression its given against the inputs it is
given.

The Node side loads the WebAssembly module and facilitates preparing all of the
inputs and calling the WebAssembly functions.

And poof: out comes the evaluated value.

This example spends a lot of time explaining the WebAssembly marshalling and
demarshalling and far less time on what RCP19 is or how to use the
[rets_expression] library.

## Pre-requisites

### Rust (to build the WebAssembly module)

#### Install Rust

Install Rust by going to [rustup.rs] and following the instructions.

#### Install the WebAssembly target

`rustup`, by default, can only compile to your computer's architecture.
WebAssembly is a different architecture, so it needs to be added.

Run

```
rustup target add wasm32-unknown-unknown
```

### Node

A version of Node that includes the `WebAssembly` global object is required. I
don't know when it was introduced (but I believe quite a while ago). This
example was tested against v23.9.0.

## Building

Makefiles! Running the following will build `evaluator.wasm` in the root
directory.

```
make
```

If you don't have `make` installed, that's not a big deal.

```
cd evaluator
cargo build --release --target wasm32-unknown-unknown
cp target/wasm32-unknown-unknown/release/evaluator.wasm ../evaluator.wasm
```

## Running

Run the example by... uh... using the `node` executable.

```
node index.js
```

[rets_expression]: https://docs.rs/rets_expression
[crates.io]: https://crates.io
[rustup.rs]: https://rustup.rs
