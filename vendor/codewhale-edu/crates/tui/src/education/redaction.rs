use std::env;

const REDACTED: &str = "[REDACTED]";
const HOME: &str = "~";
const EXPLICIT_ASSIGNMENT_KEYS: &[&str] = &[
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "DEEPSEEK_API_KEY",
    "OPENROUTER_API_KEY",
    "GITHUB_TOKEN",
    "AWS_SECRET_ACCESS_KEY",
    "HF_TOKEN",
    "CODEX_ACCESS_TOKEN",
    "OPENAI_CODEX_ACCESS_TOKEN",
    "NVIDIA_API_KEY",
    "VOLCENGINE_API_KEY",
    "ARK_API_KEY",
    "ZAI_API_KEY",
    "PASSWORD",
    "DB_PASSWORD",
    "DATABASE_URL",
    "SECRET_KEY",
    "PRIVATE_KEY",
];
const SENSITIVE_KEY_SUFFIXES: &[&str] = &[
    "_TOKEN",
    "_SECRET",
    "_API_KEY",
    "_ACCESS_KEY",
    "_PASSWORD",
    "_PRIVATE_KEY",
    "_SECRET_KEY",
];
const BARE_GENERIC_ASSIGNMENT_KEYS: &[&str] = &["TOKEN", "SECRET", "API_KEY", "ACCESS_KEY"];

pub fn redact_text(input: &str) -> String {
    let mut output = input.to_string();

    if let Some(home) = env::var_os("HOME").and_then(|v| v.into_string().ok())
        && !home.is_empty()
    {
        output = output.replace(&home, HOME);
    }

    output = redact_assignments(&output);
    output = redact_bearer_tokens(&output);
    output = redact_masked_key_mentions(&output);
    output
}

pub fn is_sensitive_path(path: &str) -> bool {
    let lower = path.replace('\\', "/").to_ascii_lowercase();
    let basename = lower.rsplit('/').next().unwrap_or(&lower);
    let is_env_file =
        lower.ends_with(".env") || basename.starts_with(".env.") || basename == ".envrc";

    is_env_file
        || lower == ".ssh"
        || lower.starts_with(".ssh/")
        || lower.ends_with("/.ssh")
        || lower.contains("/.ssh/")
        || lower.ends_with("id_rsa")
        || lower.ends_with("id_ed25519")
        || lower.ends_with(".netrc")
        || lower.ends_with(".npmrc")
        || lower.ends_with(".pypirc")
        || lower == ".kube/config"
        || lower.ends_with("/.kube/config")
        || lower == ".docker/config.json"
        || lower.ends_with("/.docker/config.json")
        || lower.contains("credentials")
        || lower.contains("secret")
}

fn redact_assignments(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut cursor = 0;

    while cursor < input.len() {
        let line_end = input[cursor..]
            .find(['\r', '\n'])
            .map_or(input.len(), |line_ending| cursor + line_ending);
        output.push_str(&redact_assignment_line(&input[cursor..line_end]));

        if line_end == input.len() {
            cursor = line_end;
            continue;
        }

        if input[line_end..].starts_with("\r\n") {
            output.push_str("\r\n");
            cursor = line_end + 2;
        } else {
            output.push_str(&input[line_end..line_end + 1]);
            cursor = line_end + 1;
        }
    }

    output
}

fn redact_assignment_line(line: &str) -> String {
    let mut output = String::with_capacity(line.len());
    let mut cursor = 0;

    while let Some(eq_offset) = line[cursor..].find('=') {
        let eq_index = cursor + eq_offset;
        if let Some((key_start, key_end, value_start)) = assignment_bounds(line, eq_index)
            && is_sensitive_assignment_key(&line[key_start..key_end])
        {
            let value_end = assignment_value_end(line, value_start);
            output.push_str(&line[cursor..value_start]);
            output.push_str(REDACTED);
            cursor = value_end;
            continue;
        }

        let eq_end = eq_index + 1;
        output.push_str(&line[cursor..eq_end]);
        cursor = eq_end;
    }

    output.push_str(&line[cursor..]);
    output
}

fn assignment_value_end(line: &str, value_start: usize) -> usize {
    let bytes = line.as_bytes();
    if value_start >= bytes.len() {
        return value_start;
    }

    if bytes[value_start] == b'"' || bytes[value_start] == b'\'' {
        let quote = bytes[value_start];
        return bytes[value_start + 1..]
            .iter()
            .position(|byte| *byte == quote)
            .map_or(line.len(), |index| value_start + 1 + index + 1);
    }

    bytes[value_start..]
        .iter()
        .position(u8::is_ascii_whitespace)
        .map_or(line.len(), |index| value_start + index)
}

fn assignment_bounds(line: &str, eq_index: usize) -> Option<(usize, usize, usize)> {
    let bytes = line.as_bytes();

    let mut key_end = eq_index;
    while key_end > 0 && is_assignment_space(bytes[key_end - 1]) {
        key_end -= 1;
    }

    let mut key_start = key_end;
    while key_start > 0 && is_assignment_key_byte(bytes[key_start - 1]) {
        key_start -= 1;
    }

    if key_start == key_end {
        return None;
    }

    let mut value_start = eq_index + 1;
    while value_start < bytes.len() && is_assignment_space(bytes[value_start]) {
        value_start += 1;
    }

    Some((key_start, key_end, value_start))
}

fn is_sensitive_assignment_key(key: &str) -> bool {
    let uppercase = key.to_ascii_uppercase();
    EXPLICIT_ASSIGNMENT_KEYS
        .iter()
        .any(|explicit| uppercase == *explicit)
        || BARE_GENERIC_ASSIGNMENT_KEYS
            .iter()
            .any(|generic| uppercase == *generic)
        || SENSITIVE_KEY_SUFFIXES
            .iter()
            .any(|suffix| uppercase.ends_with(suffix))
}

fn is_assignment_key_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_'
}

fn is_assignment_space(byte: u8) -> bool {
    byte == b' ' || byte == b'\t'
}

fn redact_bearer_tokens(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut cursor = 0;

    while cursor < input.len() {
        if let Some((value_start, value_end)) = bearer_value_bounds(input, cursor) {
            output.push_str(&input[cursor..value_start]);
            output.push_str(REDACTED);
            cursor = value_end;
            continue;
        }

        if starts_with_token_prefix(&input[cursor..]) {
            let end = token_end(input, cursor);
            output.push_str(REDACTED);
            cursor = end;
            continue;
        }

        let ch = input[cursor..]
            .chars()
            .next()
            .expect("cursor is within input");
        output.push(ch);
        cursor += ch.len_utf8();
    }

    output
}

fn redact_masked_key_mentions(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut cursor = 0;

    while cursor < input.len() {
        let Some(relative_start) = input[cursor..].find("****") else {
            output.push_str(&input[cursor..]);
            break;
        };
        let start = cursor + relative_start;
        let end = masked_key_end(input, start);
        if end > start + 4 && has_sensitive_key_context(input, start) {
            output.push_str(&input[cursor..start]);
            output.push_str(REDACTED);
            cursor = end;
            continue;
        }

        output.push_str(&input[cursor..start + 4]);
        cursor = start + 4;
    }

    output
}

fn masked_key_end(input: &str, start: usize) -> usize {
    let mut end = start;
    for (offset, ch) in input[start..].char_indices() {
        if ch == '*' || ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
            end = start + offset + ch.len_utf8();
        } else {
            break;
        }
    }
    end
}

fn has_sensitive_key_context(input: &str, start: usize) -> bool {
    let context_start = start.saturating_sub(96);
    let context = input[context_start..start].to_ascii_lowercase();
    context.contains("api key")
        || context.contains("apikey")
        || context.contains("api_key")
        || context.contains("token")
        || context.contains("secret")
        || context.contains("authorization")
        || context.contains("bearer")
}

fn bearer_value_bounds(input: &str, start: usize) -> Option<(usize, usize)> {
    const BEARER: &[u8] = b"bearer";

    let bytes = input.as_bytes();
    if start + BEARER.len() >= bytes.len()
        || !bytes[start..start + BEARER.len()].eq_ignore_ascii_case(BEARER)
    {
        return None;
    }

    let mut value_start = start + BEARER.len();
    if !bytes[value_start].is_ascii_whitespace() {
        return None;
    }

    while value_start < bytes.len() && bytes[value_start].is_ascii_whitespace() {
        value_start += 1;
    }

    if value_start == bytes.len() {
        return None;
    }

    let value_end = bytes[value_start..]
        .iter()
        .position(u8::is_ascii_whitespace)
        .map_or(bytes.len(), |index| value_start + index);

    Some((value_start, value_end))
}

fn starts_with_token_prefix(input: &str) -> bool {
    input.starts_with("sk-")
        || input.starts_with("ghp_")
        || input.starts_with("gho_")
        || input.starts_with("github_pat_")
        || input.starts_with("xoxb-")
}

fn token_end(input: &str, start: usize) -> usize {
    let mut end = start;
    for (offset, ch) in input[start..].char_indices() {
        if is_token_char(ch) {
            end = start + offset + ch.len_utf8();
        } else {
            break;
        }
    }
    end
}

fn is_token_char(ch: char) -> bool {
    ch.is_ascii_alphanumeric() || ch == '-' || ch == '_'
}
