use chrono::{DateTime, FixedOffset, NaiveDate};
use rets_expression::{Engine, EvaluateContext, Expression};
use std::borrow::Cow;

mod wasm;

/// Take the input, use the [rets_expression] interface to evaluate, and return a result.
fn evaluate_expression(
    expression: String,
    value: serde_json::Value,
    previous_value: Option<serde_json::Value>,
    now: DateTime<FixedOffset>,
    today: NaiveDate,
) -> Result<serde_json::Value, String> {
    // Parse the RCP19 expression.
    let expression = expression
        .parse::<Expression>()
        .map_err(|err| format!("Failed to parse expression: {err}"))?;

    // Set up the evaluation engine
    let engine = Engine::default()
        .with_function("NOW", Box::new(NowFunction))
        .with_function("TODAY", Box::new(TodayFunction));

    // Set up some context when running the engine
    let state = TimeState { now, today };
    let context = EvaluateContext::new_with_state(&engine, &value, state)
        .set_previous(previous_value.as_ref());

    // Evaluate the expression
    let value = expression
        .apply(context)
        .map_err(|err| format!("Failed to evaluate expression: {err}"))?;

    // And return the JSON that came out of the engine
    Ok(value.into_owned())
}

/// State provided to the [rets_expression::Engine]
///
/// WebAssembly is a very strict sandbox; it doesn't even have a way to get the current time. So we
/// need to override the `.TODAY.` and `.NOW.` intrinsics to look at this state instead of trying
/// to get the time from the environment.
#[derive(Copy, Clone)]
struct TimeState {
    now: DateTime<chrono::FixedOffset>,
    today: chrono::NaiveDate,
}

/// The function that handles calls to `.TODAY.`
///
/// When called, this creates a JSON string in `1985-04-21` format.
struct TodayFunction;

impl rets_expression::function::Function<TimeState> for TodayFunction {
    fn evaluate<'json>(
        &self,
        context: rets_expression::function::FunctionContext<'_, TimeState>,
        _input: Vec<Cow<'json, serde_json::Value>>,
    ) -> Result<Cow<'json, serde_json::Value>, rets_expression::function::FunctionError> {
        let state = context.state();
        Ok(Cow::Owned(serde_json::Value::String(
            state.today.format("%Y-%m-%d").to_string(),
        )))
    }
}

/// The function that handles calls to `.NOW.`
///
/// When called, this creates a JSON string in `1985-04-21T01:35:57Z` format.
struct NowFunction;

impl rets_expression::function::Function<TimeState> for NowFunction {
    fn evaluate<'json>(
        &self,
        context: rets_expression::function::FunctionContext<'_, TimeState>,
        _input: Vec<Cow<'json, serde_json::Value>>,
    ) -> Result<Cow<'json, serde_json::Value>, rets_expression::function::FunctionError> {
        let state = context.state();
        Ok(Cow::Owned(serde_json::Value::String(
            state
                .now
                .to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        )))
    }
}
