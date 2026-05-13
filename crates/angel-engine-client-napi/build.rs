use std::env;
use std::fs;
use std::path::{Path, PathBuf};

fn main() {
    napi_build::setup();
    generate_engine_event_enums();
}

fn generate_engine_event_enums() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("manifest dir"));
    let engine_src = manifest_dir.join("../angel-engine/src");
    let generated = [
        generated_enum(
            &engine_src.join("state/action.rs"),
            "ActionKind",
            "EngineEventActionKind",
            "snake_case",
        ),
        generated_enum(
            &engine_src.join("state/action.rs"),
            "ActionPhase",
            "EngineEventActionPhase",
            "snake_case",
        ),
        generated_enum(
            &engine_src.join("state/action.rs"),
            "ActionOutputDelta",
            "EngineEventActionOutputKind",
            "PascalCase",
        ),
        generated_enum(
            &engine_src.join("state/turn.rs"),
            "ContentDelta",
            "EngineEventContentKind",
            "PascalCase",
        ),
        generated_enum(
            &engine_src.join("state/elicitation.rs"),
            "ElicitationKind",
            "EngineEventElicitationKind",
            "PascalCase",
        ),
        generated_enum(
            &engine_src.join("state/elicitation.rs"),
            "ElicitationPhase",
            "EngineEventElicitationPhase",
            "PascalCase",
        ),
        generated_enum(
            &engine_src.join("state/elicitation.rs"),
            "ElicitationDecision",
            "EngineEventElicitationDecision",
            "PascalCase",
        ),
        generated_enum(
            &engine_src.join("state/history.rs"),
            "HistoryRole",
            "EngineEventHistoryRole",
            "PascalCase",
        ),
        generated_enum(
            &engine_src.join("state/turn.rs"),
            "TurnOutcome",
            "EngineEventTurnOutcome",
            "PascalCase",
        ),
    ]
    .join("\n");

    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("out dir"));
    fs::write(out_dir.join("engine_event_enums.rs"), generated).expect("write generated enums");
}

fn generated_enum(path: &Path, source_name: &str, export_name: &str, case: &str) -> String {
    println!("cargo:rerun-if-changed={}", path.display());
    let source = fs::read_to_string(path).expect("read engine source");
    let syntax = syn::parse_file(&source).expect("parse engine source");
    let variants = syntax
        .items
        .iter()
        .find_map(|item| match item {
            syn::Item::Enum(item) if item.ident == source_name => Some(&item.variants),
            _ => None,
        })
        .unwrap_or_else(|| panic!("missing enum {source_name} in {}", path.display()));
    let generated_variants = variants
        .iter()
        .map(|variant| format!("    {},", variant.ident))
        .collect::<Vec<_>>()
        .join("\n");
    format!(
        "#[napi(string_enum = \"{case}\")]\npub enum {export_name} {{\n{generated_variants}\n}}\n"
    )
}
