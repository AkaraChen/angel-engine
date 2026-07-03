use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

use aghub_agents::AgentDescriptor;
use aghub_agents::agents;

use crate::snapshot::{SkillScopeSnapshot, SkillSnapshot};

/// Filesystem-based skill discovery for a runtime, without booting the agent.
///
/// Skill directory conventions per runtime come from the `aghub-agents`
/// descriptors and SKILL.md parsing from the `skill` crate, so runtimes whose
/// adapters cannot list skills over the wire (or whose processes are too slow
/// to boot just for a catalog) still get a skill list. Project-scope skills
/// shadow global skills with the same name. Runtimes without a known skill
/// directory convention resolve to an empty list.
pub fn list_agent_skills(runtime: &str, project_root: Option<&Path>) -> Vec<SkillSnapshot> {
    let Some(descriptor) = agent_descriptor(runtime) else {
        return Vec::new();
    };

    let mut skills = Vec::new();
    let mut seen_names = HashSet::new();
    if let Some(root) = project_root {
        collect_skills_from_dirs(
            &descriptor.project_skill_read_paths(root),
            SkillScopeSnapshot::Repo,
            &mut skills,
            &mut seen_names,
        );
    }
    collect_skills_from_dirs(
        &descriptor.global_skill_read_paths(),
        SkillScopeSnapshot::User,
        &mut skills,
        &mut seen_names,
    );

    skills.sort_by(|a, b| a.name.cmp(&b.name));
    skills
}

/// Filesystem-based skill discovery from explicit JS-provided directories.
///
/// This is the extension path for JS-registered agents; it does not replace the
/// runtime descriptor path above.
pub fn list_agent_skills_from_dirs(
    global_dirs: &[PathBuf],
    project_relative_dirs: &[PathBuf],
    project_root: Option<&Path>,
) -> Vec<SkillSnapshot> {
    let mut skills = Vec::new();
    let mut seen_names = HashSet::new();
    if let Some(root) = project_root {
        let project_dirs = project_relative_dirs
            .iter()
            .map(|dir| root.join(dir))
            .collect::<Vec<_>>();
        collect_skills_from_dirs(
            &project_dirs,
            SkillScopeSnapshot::Repo,
            &mut skills,
            &mut seen_names,
        );
    }
    collect_skills_from_dirs(
        global_dirs,
        SkillScopeSnapshot::User,
        &mut skills,
        &mut seen_names,
    );

    skills.sort_by(|a, b| a.name.cmp(&b.name));
    skills
}

fn agent_descriptor(runtime: &str) -> Option<&'static AgentDescriptor> {
    match runtime {
        "claude" => Some(&agents::claude::DESCRIPTOR),
        "cline" => Some(&agents::cline::DESCRIPTOR),
        "codex" => Some(&agents::codex::DESCRIPTOR),
        "copilot" => Some(&agents::copilot::DESCRIPTOR),
        "cursor" => Some(&agents::cursor::DESCRIPTOR),
        "gemini" => Some(&agents::gemini::DESCRIPTOR),
        "kimi" => Some(&agents::kimi::DESCRIPTOR),
        "opencode" => Some(&agents::opencode::DESCRIPTOR),
        "pi" => Some(&agents::pi::DESCRIPTOR),
        _ => None,
    }
}

fn collect_skills_from_dirs(
    dirs: &[PathBuf],
    scope: SkillScopeSnapshot,
    skills: &mut Vec<SkillSnapshot>,
    seen_names: &mut HashSet<String>,
) {
    for dir in dirs {
        collect_skills(dir, scope, skills, seen_names);
    }
}

fn collect_skills(
    dir: &Path,
    scope: SkillScopeSnapshot,
    skills: &mut Vec<SkillSnapshot>,
    seen_names: &mut HashSet<String>,
) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        match skill::parse_skill_dir(&path) {
            Ok(parsed) => {
                let Some(skill_md) = skill_md_path(&path) else {
                    continue;
                };
                if !seen_names.insert(parsed.name.clone()) {
                    continue;
                }
                skills.push(SkillSnapshot {
                    name: parsed.name,
                    description: parsed.description,
                    path: skill_md.display().to_string(),
                    scope,
                    enabled: true,
                });
            }
            // Not a skill itself - recurse so grouped layouts
            // (e.g. plugin caches nesting skill dirs) are still found.
            Err(_) => collect_skills(&path, scope, skills, seen_names),
        }
    }
}

/// Resolve the SKILL.md path for a discovered skill directory, canonicalized
/// so symlinked installs match the paths runtimes report for the same skill.
fn skill_md_path(dir: &Path) -> Option<PathBuf> {
    let dir = fs::canonicalize(dir).ok()?;
    ["SKILL.md", "skill.md"]
        .into_iter()
        .map(|name| dir.join(name))
        .find(|path| path.is_file())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_skill(root: &Path, dir_name: &str, name: &str, description: &str) {
        let dir = root.join(dir_name);
        fs::create_dir_all(&dir).expect("skill dir");
        fs::write(
            dir.join("SKILL.md"),
            format!("---\nname: {name}\ndescription: {description}\n---\nBody\n"),
        )
        .expect("skill md");
    }

    #[test]
    fn collects_skills_with_project_shadowing_global() {
        let temp = tempfile::tempdir().expect("tempdir");
        let global = temp.path().join("global");
        let project = temp.path().join("project");
        write_skill(&global, "shared", "shared-skill", "Global variant");
        write_skill(&global, "global-only", "global-only", "Global only");
        write_skill(&project, "shared", "shared-skill", "Project variant");

        let mut skills = Vec::new();
        let mut seen = HashSet::new();
        collect_skills_from_dirs(&[project], SkillScopeSnapshot::Repo, &mut skills, &mut seen);
        collect_skills_from_dirs(&[global], SkillScopeSnapshot::User, &mut skills, &mut seen);
        skills.sort_by(|a, b| a.name.cmp(&b.name));

        assert_eq!(skills.len(), 2);
        assert_eq!(skills[0].name, "global-only");
        assert_eq!(skills[0].scope, SkillScopeSnapshot::User);
        assert_eq!(skills[1].name, "shared-skill");
        assert_eq!(skills[1].description, "Project variant");
        assert_eq!(skills[1].scope, SkillScopeSnapshot::Repo);
        assert!(skills[1].path.ends_with("SKILL.md"));
    }

    #[test]
    fn recurses_into_grouped_skill_layouts() {
        let temp = tempfile::tempdir().expect("tempdir");
        let root = temp.path().join("skills");
        write_skill(&root.join("group"), "nested", "nested-skill", "Nested");

        let mut skills = Vec::new();
        let mut seen = HashSet::new();
        collect_skills(&root, SkillScopeSnapshot::User, &mut skills, &mut seen);

        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "nested-skill");
    }

    #[test]
    fn unknown_runtime_resolves_to_empty_list() {
        assert!(list_agent_skills("qoder", None).is_empty());
        assert!(list_agent_skills("not-a-runtime", None).is_empty());
    }

    #[test]
    fn pi_runtime_uses_descriptor_skill_paths() {
        let temp = tempfile::tempdir().expect("tempdir");
        let project = temp.path().join("project");
        let skills = project.join(".pi").join("skills");
        write_skill(&skills, "repo-pi", "repo-pi", "Repo Pi skill");

        let skills = list_agent_skills("pi", Some(&project));

        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "repo-pi");
        assert_eq!(skills[0].scope, SkillScopeSnapshot::Repo);
    }

    #[test]
    fn collects_explicit_dirs_for_js_registered_agents() {
        let temp = tempfile::tempdir().expect("tempdir");
        let global = temp.path().join("global");
        let project_root = temp.path().join("project");
        let project_skills = project_root.join(".agent").join("skills");
        write_skill(&global, "global", "global-skill", "Global skill");
        write_skill(&project_skills, "repo", "repo-skill", "Repo skill");

        let skills = list_agent_skills_from_dirs(
            &[global],
            &[PathBuf::from(".agent/skills")],
            Some(&project_root),
        );

        assert_eq!(skills.len(), 2);
        assert_eq!(skills[0].name, "global-skill");
        assert_eq!(skills[0].scope, SkillScopeSnapshot::User);
        assert_eq!(skills[1].name, "repo-skill");
        assert_eq!(skills[1].scope, SkillScopeSnapshot::Repo);
    }

    #[test]
    fn explicit_dirs_skip_project_relative_dirs_without_project_root() {
        let temp = tempfile::tempdir().expect("tempdir");
        let global = temp.path().join("global");
        write_skill(&global, "global", "global-skill", "Global skill");

        let skills =
            list_agent_skills_from_dirs(&[global], &[PathBuf::from(".agent/skills")], None);
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "global-skill");
        assert_eq!(skills[0].scope, SkillScopeSnapshot::User);
    }
}
