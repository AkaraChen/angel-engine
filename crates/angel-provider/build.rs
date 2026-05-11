use std::{collections::BTreeMap, env, fs, path::PathBuf};

use typify::{TypeSpace, TypeSpaceSettings};

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("manifest dir"));
    let workspace_dir = manifest_dir
        .parent()
        .and_then(|path| path.parent())
        .expect("workspace dir");
    let schema_path =
        workspace_dir.join("vendor/codex/json-schema/codex_app_server_protocol.v2.schemas.json");

    println!("cargo:rerun-if-changed={}", schema_path.display());

    let schema = fs::read_to_string(&schema_path).expect("read Codex app-server v2 schema");
    let schema_json: serde_json::Value =
        serde_json::from_str(&schema).expect("parse Codex app-server v2 schema json");
    let root_schema = serde_json::from_str(&schema).expect("parse Codex app-server v2 schema");

    let mut type_space = TypeSpace::new(TypeSpaceSettings::default().with_struct_builder(false));
    type_space
        .add_root_schema(root_schema)
        .expect("typify Codex app-server v2 schema");

    let syntax = syn::parse2::<syn::File>(type_space.to_stream())
        .expect("parse generated Codex app-server v2 types");
    let generated = prettyplease::unparse(&syntax);

    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("out dir"));
    fs::write(out_dir.join("codex_app_server_protocol_v2.rs"), generated)
        .expect("write generated Codex app-server v2 types");
    fs::write(
        out_dir.join("codex_app_server_protocol_v2_constants.rs"),
        generate_codex_constants(&schema_json),
    )
    .expect("write generated Codex app-server v2 constants");
}

fn generate_codex_constants(schema: &serde_json::Value) -> String {
    let mut output = String::from(
        "// Generated from vendor/codex/json-schema/codex_app_server_protocol.v2.schemas.json\n\n",
    );
    let mut client_request_methods = extract_discriminants(schema, "ClientRequest", "method");
    let mut server_notification_methods =
        extract_discriminants(schema, "ServerNotification", "method");
    let thread_item_types = extract_discriminants(schema, "ThreadItem", "type");
    insert_codex_extension_discriminants(
        &mut client_request_methods,
        &mut server_notification_methods,
    );

    push_string_constants_module(
        &mut output,
        "client_request_method",
        &client_request_methods,
    );
    push_string_enum(
        &mut output,
        "ClientRequestMethod",
        "client_request_method",
        &client_request_methods,
    );
    push_string_constants_module(
        &mut output,
        "server_notification_method",
        &server_notification_methods,
    );
    push_string_enum(
        &mut output,
        "ServerNotificationMethod",
        "server_notification_method",
        &server_notification_methods,
    );
    push_string_constants_module(&mut output, "thread_item_type", &thread_item_types);
    push_string_enum(
        &mut output,
        "ThreadItemType",
        "thread_item_type",
        &thread_item_types,
    );
    output
}

fn insert_codex_extension_discriminants(
    client_request_methods: &mut BTreeMap<String, String>,
    server_notification_methods: &mut BTreeMap<String, String>,
) {
    client_request_methods.insert("THREAD_CLOSE".to_string(), "thread/close".to_string());
    server_notification_methods.insert(
        "RAW_RESPONSE_ITEM_COMPLETED".to_string(),
        "rawResponseItem/completed".to_string(),
    );
}

fn extract_discriminants(
    schema: &serde_json::Value,
    definition: &str,
    property: &str,
) -> BTreeMap<String, String> {
    let variants = schema
        .get("definitions")
        .and_then(|definitions| definitions.get(definition))
        .and_then(|definition| definition.get("oneOf"))
        .and_then(serde_json::Value::as_array)
        .unwrap_or_else(|| panic!("schema definition {definition}.oneOf"));

    variants
        .iter()
        .filter_map(|variant| {
            let value = variant
                .get("properties")
                .and_then(|properties| properties.get(property))
                .and_then(|property| property.get("enum"))
                .and_then(serde_json::Value::as_array)
                .and_then(|values| values.first())
                .and_then(serde_json::Value::as_str)?;
            Some((const_ident(value), value.to_string()))
        })
        .collect()
}

fn push_string_constants_module(
    output: &mut String,
    module: &str,
    constants: &BTreeMap<String, String>,
) {
    output.push_str(&format!("pub(crate) mod {module} {{\n"));
    for (ident, value) in constants {
        output.push_str(&format!(
            "    pub(crate) const {ident}: &str = {:?};\n",
            value
        ));
    }
    output.push_str("}\n\n");
}

fn push_string_enum(
    output: &mut String,
    enum_name: &str,
    constants_module: &str,
    constants: &BTreeMap<String, String>,
) {
    output.push_str("#[derive(Clone, Copy, Debug, PartialEq, Eq)]\n");
    output.push_str(&format!("pub(crate) enum {enum_name} {{\n"));
    for ident in constants.keys() {
        output.push_str(&format!("    {},\n", enum_variant_ident(ident)));
    }
    output.push_str("}\n\n");

    output.push_str(&format!("impl {enum_name} {{\n"));
    output.push_str("    pub(crate) fn as_str(self) -> &'static str {\n");
    output.push_str("        match self {\n");
    for ident in constants.keys() {
        output.push_str(&format!(
            "            Self::{} => {constants_module}::{ident},\n",
            enum_variant_ident(ident)
        ));
    }
    output.push_str("        }\n");
    output.push_str("    }\n");
    output.push_str("}\n\n");

    output.push_str(&format!("impl ::std::str::FromStr for {enum_name} {{\n"));
    output.push_str("    type Err = ();\n\n");
    output.push_str("    fn from_str(value: &str) -> Result<Self, Self::Err> {\n");
    output.push_str("        match value {\n");
    for ident in constants.keys() {
        output.push_str(&format!(
            "            {constants_module}::{ident} => Ok(Self::{}),\n",
            enum_variant_ident(ident)
        ));
    }
    output.push_str("            _ => Err(()),\n");
    output.push_str("        }\n");
    output.push_str("    }\n");
    output.push_str("}\n\n");
}

fn const_ident(value: &str) -> String {
    let mut ident = String::new();
    let mut previous_was_separator = true;
    let mut previous_was_lower_or_digit = false;

    for character in value.chars() {
        if character.is_ascii_alphanumeric() {
            if character.is_ascii_uppercase()
                && !previous_was_separator
                && previous_was_lower_or_digit
            {
                ident.push('_');
            }
            ident.push(character.to_ascii_uppercase());
            previous_was_separator = false;
            previous_was_lower_or_digit =
                character.is_ascii_lowercase() || character.is_ascii_digit();
        } else {
            if !ident.ends_with('_') {
                ident.push('_');
            }
            previous_was_separator = true;
            previous_was_lower_or_digit = false;
        }
    }

    while ident.ends_with('_') {
        ident.pop();
    }
    if ident
        .chars()
        .next()
        .map(|character| character.is_ascii_digit())
        .unwrap_or(true)
    {
        ident.insert(0, '_');
    }
    ident
}

fn enum_variant_ident(ident: &str) -> String {
    ident
        .split('_')
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            let Some(first) = chars.next() else {
                return String::new();
            };
            format!("{}{}", first, chars.as_str().to_ascii_lowercase())
        })
        .collect()
}
