use angel_engine::{ElicitationOptions, UserQuestion, UserQuestionOption};
use serde_json::Value;

pub(super) fn acp_elicitation_form_options(message: &str, params: &Value) -> ElicitationOptions {
    let required = params
        .get("requestedSchema")
        .and_then(|schema| schema.get("required"))
        .and_then(Value::as_array)
        .map(|required| {
            required
                .iter()
                .filter_map(Value::as_str)
                .collect::<std::collections::BTreeSet<_>>()
        })
        .unwrap_or_default();
    let questions = params
        .get("requestedSchema")
        .and_then(|schema| schema.get("properties"))
        .and_then(Value::as_object)
        .map(|properties| {
            properties
                .iter()
                .map(|(id, schema)| {
                    acp_elicitation_question(id, message, schema, required.contains(id.as_str()))
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    ElicitationOptions {
        title: Some(message.to_string()),
        body: Some(message.to_string()),
        choices: if questions.len() == 1 {
            questions[0]
                .options
                .iter()
                .map(|option| option.label.clone())
                .collect()
        } else {
            Vec::new()
        },
        choice_details: Vec::new(),
        questions,
    }
}

fn acp_elicitation_question(
    id: &str,
    message: &str,
    schema: &Value,
    required: bool,
) -> UserQuestion {
    let header = schema
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or(id)
        .to_string();
    let question = schema
        .get("description")
        .or_else(|| schema.get("title"))
        .and_then(Value::as_str)
        .unwrap_or(message)
        .to_string();
    UserQuestion {
        id: id.to_string(),
        header,
        question,
        is_secret: schema
            .get("format")
            .and_then(Value::as_str)
            .is_some_and(|format| format == "password"),
        is_other: false,
        options: acp_elicitation_question_options(schema),
        schema: Some(acp_elicitation_question_schema(schema, required)),
    }
}

fn acp_elicitation_question_options(schema: &Value) -> Vec<UserQuestionOption> {
    let option_schema = if schema.get("type").and_then(Value::as_str) == Some("array") {
        schema.get("items").unwrap_or(schema)
    } else {
        schema
    };
    if let Some(values) = option_schema.get("enum").and_then(Value::as_array) {
        return values
            .iter()
            .map(|value| UserQuestionOption {
                label: json_label(value),
                description: String::new(),
            })
            .collect();
    }
    if let Some(options) = option_schema.get("oneOf").and_then(Value::as_array) {
        return options
            .iter()
            .filter_map(|option| {
                let label = option.get("title").and_then(Value::as_str).map_or_else(
                    || option.get("const").map(json_label),
                    |title| Some(title.to_string()),
                )?;
                Some(UserQuestionOption {
                    label,
                    description: option
                        .get("description")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string(),
                })
            })
            .collect();
    }
    if option_schema.get("type").and_then(Value::as_str) == Some("boolean") {
        return vec![
            UserQuestionOption {
                label: "true".to_string(),
                description: String::new(),
            },
            UserQuestionOption {
                label: "false".to_string(),
                description: String::new(),
            },
        ];
    }
    Vec::new()
}

fn acp_elicitation_question_schema(
    schema: &Value,
    required: bool,
) -> angel_engine::UserQuestionSchema {
    let value_type = question_value_type(schema);
    let item_value_type = schema.get("items").map(question_value_type);
    angel_engine::UserQuestionSchema {
        multiple: matches!(value_type, angel_engine::QuestionValueType::Array),
        value_type,
        item_value_type,
        required,
        format: schema
            .get("format")
            .and_then(Value::as_str)
            .map(str::to_string),
        default_value: schema.get("default").map(json_label),
        constraints: angel_engine::QuestionConstraints {
            pattern: string_constraint(schema, "pattern"),
            minimum: scalar_constraint(schema, "minimum"),
            maximum: scalar_constraint(schema, "maximum"),
            min_length: scalar_constraint(schema, "minLength"),
            max_length: scalar_constraint(schema, "maxLength"),
            min_items: scalar_constraint(schema, "minItems"),
            max_items: scalar_constraint(schema, "maxItems"),
            unique_items: schema.get("uniqueItems").and_then(Value::as_bool),
        },
        raw_schema: Some(json_string(schema)),
    }
}

fn question_value_type(schema: &Value) -> angel_engine::QuestionValueType {
    match schema
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("unknown")
    {
        "string" => angel_engine::QuestionValueType::String,
        "number" => angel_engine::QuestionValueType::Number,
        "integer" => angel_engine::QuestionValueType::Integer,
        "boolean" => angel_engine::QuestionValueType::Boolean,
        "array" => angel_engine::QuestionValueType::Array,
        "object" => angel_engine::QuestionValueType::Object,
        other => angel_engine::QuestionValueType::Unknown(other.to_string()),
    }
}

fn string_constraint(schema: &Value, key: &str) -> Option<String> {
    schema.get(key).and_then(Value::as_str).map(str::to_string)
}

fn scalar_constraint(schema: &Value, key: &str) -> Option<String> {
    schema.get(key).map(json_label)
}

fn json_label(value: &Value) -> String {
    value
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| value.to_string())
}

fn json_string(value: &Value) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| value.to_string())
}
