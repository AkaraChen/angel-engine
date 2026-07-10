use std::time::Instant;

use angel_engine::TransportOutput;

use super::EngineResult;
use crate::napi_trace;

pub(super) fn trace_engine_result<T>(operation: &str, started: Instant, result: &EngineResult<T>) {
    match result {
        Ok(_) => napi_trace(format!(
            "{operation} ok elapsed_ms={}",
            started.elapsed().as_millis()
        )),
        Err(error) => napi_trace(format!(
            "{operation} error elapsed_ms={} error={}",
            started.elapsed().as_millis(),
            error
        )),
    }
}

pub(super) fn trace_transport_output_result(
    operation: &str,
    started: Instant,
    result: &EngineResult<TransportOutput>,
) {
    match result {
        Ok(output) => napi_trace(format!(
            "{operation} ok elapsed_ms={} messages={} events={} completed_requests={} logs={}",
            started.elapsed().as_millis(),
            output.messages.len(),
            output.events.len(),
            output.completed_requests.len(),
            output.logs.len()
        )),
        Err(error) => napi_trace(format!(
            "{operation} error elapsed_ms={} error={}",
            started.elapsed().as_millis(),
            error
        )),
    }
}

pub(super) fn trace_optional_value<T, F>(
    operation: &str,
    detail: impl Into<String>,
    action: F,
) -> Option<T>
where
    F: FnOnce() -> Option<T>,
{
    let detail = detail.into();
    let started = Instant::now();
    napi_trace(format!("{operation} start {detail}"));
    let value = action();
    napi_trace(format!(
        "{operation} ok elapsed_ms={} returned={}",
        started.elapsed().as_millis(),
        if value.is_some() { "some" } else { "none" }
    ));
    value
}
