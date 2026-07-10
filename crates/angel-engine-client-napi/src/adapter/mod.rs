mod acp;
mod codec;
mod js;
mod native_base;
mod runtime;
mod trace;

use angel_engine::EngineError;

type EngineResult<T> = std::result::Result<T, EngineError>;

pub(crate) use runtime::NapiRuntimeAdapter;
