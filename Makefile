.PHONY: default
default: evaluator.wasm

evaluator.wasm: evaluator/src/lib.rs evaluator/src/wasm.rs evaluator/Cargo.toml
	cd evaluator && cargo build --release --target wasm32-unknown-unknown
	cp evaluator/target/wasm32-unknown-unknown/release/evaluator.wasm evaluator.wasm
