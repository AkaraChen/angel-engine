use super::*;

#[test]
fn answer_values_maps_numbered_choices_and_free_text() {
    let question = CliQuestion {
        id: "path".to_string(),
        header: "Plan path".to_string(),
        question: "Where should the plan be saved?".to_string(),
        options: vec![
            CliQuestionOption {
                label: "plans/plan.md".to_string(),
                description: "Use the plans folder".to_string(),
            },
            CliQuestionOption {
                label: "PLAN.md".to_string(),
                description: "Use the repository root".to_string(),
            },
        ],
    };

    assert_eq!(
        answer_values(&question, "1, PLAN.md"),
        vec!["plans/plan.md".to_string(), "PLAN.md".to_string()]
    );
}

#[test]
fn compact_text_normalizes_whitespace_and_truncates() {
    assert_eq!(compact_text("a\n  b\tc", 20), "a b c");
    assert_eq!(compact_text("abcdefghijkl", 8), "abcde...");
}
