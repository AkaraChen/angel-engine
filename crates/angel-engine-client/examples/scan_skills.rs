use std::env;
use std::path::PathBuf;

fn main() {
    let mut args = env::args().skip(1);
    let runtime = args.next().unwrap_or_else(|| "codex".to_string());
    let project_root = args
        .next()
        .map(PathBuf::from)
        .or_else(|| env::current_dir().ok());

    let skills = angel_engine_client::list_agent_skills(&runtime, project_root.as_deref());
    println!("{runtime}: {} skills", skills.len());
    for skill in &skills {
        println!("  {} [{:?}] {}", skill.name, skill.scope, skill.path);
    }
}
