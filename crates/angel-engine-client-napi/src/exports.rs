use super::*;

use crate::types::process::{ListeningPortInfo, SubprocessInfo};

#[napi(js_name = "listSubprocesses")]
pub fn list_subprocesses(root_pid: u32) -> Result<Vec<SubprocessInfo>> {
    trace_napi_sync_result("listSubprocesses", format!("root_pid={root_pid}"), || {
        engine_list_subprocesses(root_pid)
            .map(|processes| {
                processes
                    .into_iter()
                    .map(|process| SubprocessInfo {
                        pid: process.pid,
                        parent_pid: process.parent_pid,
                        name: process.name,
                        command: process.command,
                    })
                    .collect()
            })
            .map_err(to_napi_error)
    })
}

#[napi(js_name = "listListeningPorts")]
pub fn list_listening_ports(pids: Vec<u32>) -> Result<Vec<ListeningPortInfo>> {
    trace_napi_sync_result("listListeningPorts", format!("pids={}", pids.len()), || {
        engine_list_listening_ports(&pids)
            .map(|ports| {
                ports
                    .into_iter()
                    .map(|port| ListeningPortInfo {
                        pid: port.pid,
                        port: port.port,
                        address: port.address,
                    })
                    .collect()
            })
            .map_err(to_napi_error)
    })
}

#[napi(
    js_name = "normalizeClientOptions",
    ts_args_type = "options: ClientOptions",
    ts_return_type = "ClientOptions"
)]
pub fn normalize_client_options(options: serde_json::Value) -> Result<serde_json::Value> {
    trace_napi_sync_result(
        "normalizeClientOptions",
        format!("input={}", json_shape(&options)),
        || {
            let options = from_json::<EngineClientOptions>(options)?;
            options
                .validate()
                .map_err(|e| Error::from_reason(format!("Validation failed: {e}")))?;
            to_json(options)
        },
    )
}

#[napi(js_name = "textThreadEvent", ts_return_type = "ThreadEvent")]
pub fn text_thread_event(text: String) -> Result<serde_json::Value> {
    trace_napi_sync_result(
        "textThreadEvent",
        format!("text_len={}", text.chars().count()),
        || to_json(EngineThreadEvent::text(text)),
    )
}

#[napi(
    js_name = "answersResponse",
    ts_args_type = "answers: ElicitationAnswer[]",
    ts_return_type = "ElicitationResponse"
)]
pub fn answers_response(answers: serde_json::Value) -> Result<serde_json::Value> {
    trace_napi_sync_result(
        "answersResponse",
        format!("answers={}", json_shape(&answers)),
        || {
            let answers = from_json::<Vec<EngineClientAnswer>>(answers)?;
            to_json(EngineElicitationResponse::answers(answers))
        },
    )
}

#[napi(
    js_name = "createRuntimeOptions",
    ts_args_type = "runtimeName: string | null, overrides: RuntimeOptionsOverrides",
    ts_return_type = "RuntimeOptions"
)]
pub fn create_runtime_options(
    runtime_name: Option<String>,
    overrides: Option<serde_json::Value>,
) -> Result<serde_json::Value> {
    let env_runtime = std::env::var("ANGEL_ENGINE_RUNTIME").ok();
    let runtime_name = runtime_name.as_deref().or(env_runtime.as_deref());
    trace_napi_sync_result(
        "createRuntimeOptions",
        format!(
            "runtime_name={} env_runtime_present={} overrides_present={}",
            runtime_name.unwrap_or("<none>"),
            env_runtime.is_some(),
            overrides.is_some()
        ),
        || {
            let overrides = match optional_json::<EngineRuntimeOptionsOverrides>(overrides)? {
                Some(overrides) => overrides,
                None => return Err(to_napi_error("createRuntimeOptions overrides are required")),
            };
            let options =
                engine_create_runtime_options(runtime_name, overrides).map_err(to_napi_error)?;
            to_json(options)
        },
    )
}

#[napi(
    js_name = "listAgentSkills",
    ts_args_type = "runtime: string, projectPath?: string | null",
    ts_return_type = "SkillSnapshot[]"
)]
pub fn list_agent_skills(
    runtime: String,
    project_path: Option<String>,
) -> Result<serde_json::Value> {
    trace_napi_sync_result(
        "listAgentSkills",
        format!(
            "runtime={} project_path={}",
            runtime,
            project_path.as_deref().unwrap_or("<none>")
        ),
        || {
            to_json(angel_engine_client::list_agent_skills(
                &runtime,
                project_path.as_deref().map(std::path::Path::new),
            ))
        },
    )
}

#[napi(
    js_name = "listAgentSkillsFromDirs",
    ts_args_type = "request: { projectPath?: string | null; globalDirs: string[]; projectRelativeDirs: string[] }",
    ts_return_type = "SkillSnapshot[]"
)]
pub fn list_agent_skills_from_dirs(request: serde_json::Value) -> Result<serde_json::Value> {
    let request = from_json::<ListAgentSkillsFromDirsRequest>(request)?;
    trace_napi_sync_result(
        "listAgentSkillsFromDirs",
        format!(
            "project_path={} global_dirs={} project_relative_dirs={}",
            request.project_path.as_deref().unwrap_or("<none>"),
            request.global_dirs.len(),
            request.project_relative_dirs.len()
        ),
        || {
            let global_dirs = request
                .global_dirs
                .iter()
                .map(std::path::PathBuf::from)
                .collect::<Vec<_>>();
            let project_relative_dirs = request
                .project_relative_dirs
                .iter()
                .map(std::path::PathBuf::from)
                .collect::<Vec<_>>();
            to_json(angel_engine_client::list_agent_skills_from_dirs(
                &global_dirs,
                &project_relative_dirs,
                request.project_path.as_deref().map(std::path::Path::new),
            ))
        },
    )
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListAgentSkillsFromDirsRequest {
    project_path: Option<String>,
    global_dirs: Vec<String>,
    project_relative_dirs: Vec<String>,
}
