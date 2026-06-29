#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CommandDecision {
    Allow,
    Approve,
    Block,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommandPolicyResult {
    pub decision: CommandDecision,
    pub reason: String,
}

pub fn classify_command(command: &str) -> CommandPolicyResult {
    let normalized = command.trim().to_ascii_lowercase();

    if normalized.is_empty() {
        return approve("empty command needs review");
    }

    if normalized.contains('\0') {
        return block("command contains a null byte");
    }

    if redirects_to_dangerous_target(&normalized) {
        return block("command redirects to a protected path");
    }

    if embedded_command_is_destructive(&normalized) {
        return block("destructive command substitution");
    }

    if pipes_remote_content_to_shell(&normalized) {
        return block("remote content piped to shell");
    }

    if segment_is_destructive(&normalized) {
        return block("destructive system command");
    }

    for segment in split_command_segments(&normalized) {
        if segment_is_destructive(&segment) {
            return block("destructive system command");
        }
    }

    if contains_shell_control(&normalized) {
        return approve("compound shell syntax needs review");
    }

    let Some(tokens) = primary_tokens(&normalized) else {
        return approve("unrecognized command needs review");
    };

    if command_requires_approval(&tokens) {
        return approve("command changes files, network, or remote state");
    }

    if command_is_low_risk(&tokens) {
        return allow("low-risk classroom command");
    }

    approve("unrecognized command needs review")
}

fn contains_shell_control(command: &str) -> bool {
    command.contains('\n')
        || command.contains('\r')
        || command.contains("&&")
        || command.contains("||")
        || command.contains(';')
        || command.contains('&')
        || command.contains('|')
        || command.contains('>')
        || command.contains('<')
        || command.contains('`')
        || command.contains("$(")
}

fn split_command_segments(command: &str) -> Vec<String> {
    command
        .replace("&&", "\n")
        .replace("||", "\n")
        .replace("|&", "\n")
        .replace([';', '|', '&'], "\n")
        .split('\n')
        .map(str::trim)
        .filter(|segment| !segment.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn embedded_command_is_destructive(command: &str) -> bool {
    wrapped_command_is_destructive(command, "$(")
        || wrapped_command_is_destructive(command, "<(")
        || wrapped_command_is_destructive(command, ">(")
        || backtick_command_is_destructive(command)
}

fn wrapped_command_is_destructive(command: &str, opener: &str) -> bool {
    let mut search_from = 0;
    while let Some(start) = command[search_from..].find(opener) {
        let payload_start = search_from + start + opener.len();
        let after_start = &command[payload_start..];
        let mut found_end = false;
        for (end, _) in after_start.match_indices(')') {
            found_end = true;
            let payload = &after_start[..end];
            if segment_is_destructive(payload) || embedded_command_is_destructive(payload) {
                return true;
            }
        }
        if !found_end {
            break;
        }
        search_from = payload_start;
    }
    false
}

fn backtick_command_is_destructive(command: &str) -> bool {
    let mut rest = command;
    while let Some(start) = rest.find('`') {
        let after_start = &rest[start + 1..];
        let Some(end) = after_start.find('`') else {
            break;
        };
        let payload = &after_start[..end];
        if segment_is_destructive(payload) || embedded_command_is_destructive(payload) {
            return true;
        }
        rest = &after_start[end + 1..];
    }

    false
}

fn primary_tokens(command: &str) -> Option<Vec<String>> {
    let tokens = shell_words(command);
    let start = primary_token_index(&tokens)?;
    Some(tokens[start..].to_vec())
}

fn shell_words(command: &str) -> Vec<String> {
    shlex::split(command).unwrap_or_else(|| {
        command
            .split_whitespace()
            .map(|token| token.trim_matches(['"', '\'']).to_string())
            .collect()
    })
}

fn primary_token_index(tokens: &[String]) -> Option<usize> {
    let mut idx = 0;
    while idx < tokens.len() {
        let token = tokens[idx].as_str();
        if command_name(token) == "env" {
            idx += 1;
            while idx < tokens.len() && is_env_prefix_token(tokens, idx) {
                if env_option_takes_operand(&tokens[idx]) && idx + 1 < tokens.len() {
                    idx += 2;
                    continue;
                }
                idx += 1;
            }
            continue;
        }
        if is_env_assignment(token) {
            idx += 1;
            continue;
        }
        return Some(idx);
    }
    None
}

fn is_env_assignment(token: &str) -> bool {
    let Some((name, _value)) = token.split_once('=') else {
        return false;
    };
    !name.is_empty()
        && name
            .chars()
            .all(|ch| ch == '_' || ch.is_ascii_alphanumeric())
        && name
            .chars()
            .next()
            .is_some_and(|ch| ch == '_' || ch.is_ascii_alphabetic())
}

fn is_env_prefix_token(tokens: &[String], idx: usize) -> bool {
    tokens[idx].starts_with('-') || is_env_assignment(&tokens[idx])
}

fn env_option_takes_operand(option: &str) -> bool {
    matches!(
        option,
        "-u" | "--unset" | "-c" | "--chdir" | "-s" | "--split-string"
    )
}

fn env_split_option(option: &str) -> bool {
    matches!(option, "-s" | "--split-string")
        || option.starts_with("-s")
        || (option.starts_with('-')
            && !option.starts_with("--")
            && option.chars().any(|ch| ch == 's'))
        || option.starts_with("--split-string=")
}

fn env_split_payload(tokens: &[String], idx: usize) -> Option<&str> {
    let token = tokens.get(idx)?;
    if matches!(token.as_str(), "-s" | "--split-string") {
        return tokens.get(idx + 1).map(String::as_str);
    }
    if let Some(payload) = token.strip_prefix("--split-string=") {
        return Some(payload);
    }
    token
        .strip_prefix("-s")
        .filter(|payload| !payload.is_empty())
}

fn env_split_payload_tokens(tokens: &[String], idx: usize) -> Option<Vec<String>> {
    let token = tokens.get(idx)?;
    if matches!(token.as_str(), "-s" | "--split-string") {
        let payload = tokens.get(idx + 1)?;
        let mut payload_tokens = shell_words(payload);
        payload_tokens.extend(tokens.iter().skip(idx + 2).cloned());
        return Some(payload_tokens);
    }
    if let Some(payload) = token.strip_prefix("--split-string=") {
        let mut payload_tokens = shell_words(payload);
        payload_tokens.extend(tokens.iter().skip(idx + 1).cloned());
        return Some(payload_tokens);
    }
    if let Some(payload) = token
        .strip_prefix("-s")
        .filter(|payload| !payload.is_empty())
    {
        let mut payload_tokens = shell_words(payload);
        payload_tokens.extend(tokens.iter().skip(idx + 1).cloned());
        return Some(payload_tokens);
    }
    if token.starts_with('-')
        && !token.starts_with("--")
        && token.chars().any(|ch| ch == 's')
        && idx + 1 < tokens.len()
    {
        let mut payload_tokens = shell_words(&tokens[idx + 1]);
        payload_tokens.extend(tokens.iter().skip(idx + 2).cloned());
        return Some(payload_tokens);
    }
    None
}

fn segment_is_destructive(segment: &str) -> bool {
    if redirects_to_dangerous_target(segment) || pipes_remote_content_to_shell(segment) {
        return true;
    }

    let default_expanded = expand_shell_parameter_defaults(segment);
    if default_expanded != segment && segment_is_destructive(&default_expanded) {
        return true;
    }

    let tokens = shell_words(segment);
    segment_tokens_are_destructive(&tokens)
}

fn segment_tokens_are_destructive(tokens: &[String]) -> bool {
    if env_split_payload_is_destructive(tokens) {
        return true;
    }

    let Some(start) = primary_token_index(tokens) else {
        return false;
    };
    let command = command_name(&tokens[start]);
    let args = &tokens[start + 1..];

    match command {
        "eval" | "shutdown" | "reboot" | "halt" | "poweroff" => true,
        command if command.starts_with("mkfs") => true,
        "diskutil" => args.iter().any(|arg| arg.starts_with("erase")),
        "sudo" => sudo_invokes_destructive(args),
        "env" => segment_tokens_are_destructive(args),
        "exec" | "command" => {
            shell_wrapper_payload_tokens(command, args).is_some_and(segment_tokens_are_destructive)
        }
        command if is_shell_command(command) => shell_invokes_destructive(args),
        "sed" => {
            sed_script_invokes_destructive(args)
                || sed_script_writes_dangerous_target(args)
                || sed_in_place_writes_dangerous_target(args)
        }
        "rm" => dangerous_rm(args),
        "cp" | "mv" => writes_dangerous_destination(args),
        "tee" => writes_dangerous_file_arg(args),
        "truncate" => writes_dangerous_file_arg(args),
        "find" => dangerous_find(args),
        "chmod" => dangerous_permission_change(args),
        "chown" => {
            args.iter()
                .any(|arg| !arg.starts_with('-') && target_is_dangerous(&normalize_target(arg)))
                || args.iter().any(|arg| recursive_flag(arg))
        }
        "dd" => args.iter().any(|arg| {
            let lower = arg.to_ascii_lowercase();
            lower.starts_with("of=/dev/")
                || lower
                    .strip_prefix("of=")
                    .is_some_and(|target| target_is_dangerous(&normalize_target(target)))
        }),
        _ => false,
    }
}

fn env_split_payload_is_destructive(tokens: &[String]) -> bool {
    tokens.iter().enumerate().any(|(idx, _token)| {
        env_split_payload_tokens(tokens, idx).is_some_and(|payload| {
            segment_tokens_are_destructive(&payload) || segment_is_destructive(&payload.join(" "))
        })
    })
}

fn command_name(token: &str) -> &str {
    token.rsplit('/').next().unwrap_or(token)
}

fn shell_wrapper_payload_tokens<'a>(command: &str, args: &'a [String]) -> Option<&'a [String]> {
    let mut idx = 0;
    match command {
        "exec" => {
            while idx < args.len() {
                match args[idx].as_str() {
                    "--" => {
                        idx += 1;
                        break;
                    }
                    "-a" if idx + 1 < args.len() => idx += 2,
                    "-c" | "-l" => idx += 1,
                    option if option.starts_with('-') => idx += 1,
                    _ => break,
                }
            }
        }
        "command" => {
            while idx < args.len() {
                match args[idx].as_str() {
                    "--" => {
                        idx += 1;
                        break;
                    }
                    "-v" | "-V" => return None,
                    "-p" => idx += 1,
                    option if option.starts_with('-') && option.contains(['v', 'V']) => {
                        return None;
                    }
                    option if option.starts_with('-') => idx += 1,
                    _ => break,
                }
            }
        }
        _ => return None,
    }
    (idx < args.len()).then_some(&args[idx..])
}

fn sudo_invokes_destructive(args: &[String]) -> bool {
    let Some(payload) = sudo_payload_tokens(args) else {
        return false;
    };
    if tokens_modify_dangerous_target(payload) {
        return true;
    }
    if tokens_invoke_rm(payload)
        && payload
            .iter()
            .any(|arg| recursive_flag(arg) || force_flag(arg))
    {
        return true;
    }
    segment_tokens_are_destructive(payload)
}

fn sudo_payload_tokens(args: &[String]) -> Option<&[String]> {
    let mut idx = 0;
    while idx < args.len() {
        let token = args[idx].as_str();
        if is_sudo_option_with_operand(token) && idx + 1 < args.len() {
            idx += 2;
            continue;
        }
        if token.starts_with('-') || is_env_assignment(token) {
            idx += 1;
            continue;
        }
        return Some(&args[idx..]);
    }
    None
}

fn shell_invokes_destructive(args: &[String]) -> bool {
    shell_payload_matches(args, segment_is_destructive)
}

fn shell_invokes_rm(args: &[String]) -> bool {
    shell_payload_matches(args, segment_invokes_rm)
}

fn shell_payload_matches(args: &[String], predicate: impl Fn(&str) -> bool) -> bool {
    for (idx, token) in args.iter().enumerate() {
        if token == "-c" {
            if shell_payload_is_match(args, idx + 1, &predicate) {
                return true;
            }
            continue;
        }
        if let Some(payload) = token.strip_prefix("-c")
            && !payload.is_empty()
            && (predicate(payload)
                || predicate(&substitute_shell_positionals(payload, &args[idx + 1..])))
        {
            return true;
        }
        if token.starts_with('-')
            && !token.starts_with("--")
            && token.contains('c')
            && shell_payload_is_match(args, idx + 1, &predicate)
        {
            return true;
        }
    }
    false
}

fn shell_payload_is_match(
    args: &[String],
    payload_idx: usize,
    predicate: &impl Fn(&str) -> bool,
) -> bool {
    let Some(payload) = args.get(payload_idx) else {
        return false;
    };
    predicate(payload)
        || predicate(&substitute_shell_positionals(
            payload,
            &args[payload_idx + 1..],
        ))
}

fn substitute_shell_positionals(payload: &str, args: &[String]) -> String {
    let mut expanded = payload.to_string();
    if let Some(arg0) = args.first() {
        expanded = replace_shell_positional(&expanded, "0", arg0);
    }

    let positional_args = args.iter().skip(1).cloned().collect::<Vec<_>>();
    if !positional_args.is_empty() {
        let joined = positional_args.join(" ");
        expanded = replace_shell_positional(&expanded, "@", &joined);
        expanded = replace_shell_positional(&expanded, "*", &joined);
    }

    for (idx, arg) in positional_args.iter().enumerate() {
        expanded = replace_shell_positional(&expanded, &(idx + 1).to_string(), arg);
    }
    expand_shell_positional_parameters(&expanded, args)
}

fn replace_shell_positional(input: &str, name: &str, value: &str) -> String {
    [
        format!("\"${name}\""),
        format!("'${name}'"),
        format!("${name}"),
        format!("\"${{{name}}}\""),
        format!("'${{{name}}}'"),
        format!("${{{name}}}"),
    ]
    .into_iter()
    .fold(input.to_string(), |current, pattern| {
        current.replace(&pattern, value)
    })
}

fn expand_shell_positional_parameters(input: &str, args: &[String]) -> String {
    let mut expanded = String::new();
    let mut rest = input;

    while let Some(start) = rest.find("${") {
        expanded.push_str(&rest[..start]);
        let after_start = &rest[start + 2..];
        let Some(end) = after_start.find('}') else {
            expanded.push_str(&rest[start..]);
            return expanded;
        };

        let inner = &after_start[..end];
        if let Some(value) = shell_positional_parameter_value(inner, args) {
            expanded.push_str(&value);
        } else {
            expanded.push_str("${");
            expanded.push_str(inner);
            expanded.push('}');
        }
        rest = &after_start[end + 1..];
    }

    expanded.push_str(rest);
    expanded
}

fn shell_positional_parameter_value(inner: &str, args: &[String]) -> Option<String> {
    let name_len = shell_parameter_name_len(inner)?;
    let name = &inner[..name_len];
    if matches!(name, "@" | "*")
        && let Some(slice_start) = shell_positional_slice_start(&inner[name_len..])
    {
        return Some(shell_positional_slice(args, slice_start));
    }
    let value = shell_positional_value(name, args)?;
    let operator_and_value = &inner[name_len..];
    let is_set = value.is_some();
    let is_non_empty = value.as_ref().is_some_and(|value| !value.is_empty());

    if operator_and_value.is_empty() {
        return value;
    }

    for operator in [":-", ":=", "-", "="] {
        if let Some(default) = operator_and_value.strip_prefix(operator) {
            return Some(if operator.starts_with(':') {
                if is_non_empty {
                    value.unwrap()
                } else {
                    default.to_string()
                }
            } else {
                value.unwrap_or(default.to_string())
            });
        }
    }
    for operator in [":+", "+"] {
        if let Some(alternate) = operator_and_value.strip_prefix(operator) {
            return Some(
                if operator.starts_with(':') {
                    if is_non_empty { alternate } else { "" }
                } else {
                    if is_set { alternate } else { "" }
                }
                .to_string(),
            );
        }
    }
    for operator in [":?", "?"] {
        if operator_and_value.strip_prefix(operator).is_some() {
            return Some(if operator.starts_with(':') {
                if is_non_empty {
                    value.unwrap()
                } else {
                    String::default()
                }
            } else {
                value.unwrap_or_default()
            });
        }
    }
    None
}

fn shell_positional_slice_start(operator_and_value: &str) -> Option<usize> {
    let after_colon = operator_and_value.strip_prefix(':')?;
    let start = after_colon
        .split(':')
        .next()
        .unwrap_or(after_colon)
        .trim()
        .parse::<isize>()
        .ok()?;
    Some(if start <= 0 { 1 } else { start as usize })
}

fn shell_positional_slice(args: &[String], start: usize) -> String {
    match start {
        0 => args.join(" "),
        1 => args.iter().skip(1).cloned().collect::<Vec<_>>().join(" "),
        _ => args
            .iter()
            .skip(start)
            .cloned()
            .collect::<Vec<_>>()
            .join(" "),
    }
}

fn shell_positional_value(name: &str, args: &[String]) -> Option<Option<String>> {
    match name {
        "0" => Some(args.first().cloned()),
        "@" | "*" => {
            let positional_args = args.iter().skip(1).cloned().collect::<Vec<_>>();
            Some((!positional_args.is_empty()).then(|| positional_args.join(" ")))
        }
        _ => {
            let index = name.parse::<usize>().ok()?;
            Some(args.get(index).cloned())
        }
    }
}

fn expand_shell_parameter_defaults(input: &str) -> String {
    let mut expanded = String::new();
    let mut rest = input;

    while let Some(start) = rest.find("${") {
        expanded.push_str(&rest[..start]);
        let after_start = &rest[start + 2..];
        let Some(end) = after_start.find('}') else {
            expanded.push_str(&rest[start..]);
            return expanded;
        };

        let inner = &after_start[..end];
        if let Some(value) = shell_parameter_default_value(inner) {
            expanded.push_str(value);
        } else {
            expanded.push_str("${");
            expanded.push_str(inner);
            expanded.push('}');
        }
        rest = &after_start[end + 1..];
    }

    expanded.push_str(rest);
    expanded
}

fn shell_parameter_default_value(inner: &str) -> Option<&str> {
    let name_len = shell_parameter_name_len(inner)?;
    let operator_and_value = &inner[name_len..];
    for operator in [":-", ":=", ":+", ":?", "-", "=", "+", "?"] {
        if let Some(value) = operator_and_value.strip_prefix(operator) {
            return Some(value);
        }
    }
    None
}

fn shell_parameter_default_values(input: &str) -> Vec<String> {
    let mut values = Vec::new();
    let mut rest = input;

    while let Some(start) = rest.find("${") {
        let after_start = &rest[start + 2..];
        let Some(end) = after_start.find('}') else {
            break;
        };

        let inner = &after_start[..end];
        if let Some(value) = shell_parameter_default_value(inner) {
            values.push(value.to_string());
        }
        rest = &after_start[end + 1..];
    }

    values
}

fn shell_parameter_name_len(input: &str) -> Option<usize> {
    let mut chars = input.char_indices();
    let (_, first) = chars.next()?;
    if first.is_ascii_digit() || matches!(first, '@' | '*' | '#' | '?' | '$' | '!') {
        return Some(first.len_utf8());
    }
    if !first.is_ascii_alphabetic() && first != '_' {
        return None;
    }

    let mut end = first.len_utf8();
    for (idx, ch) in chars {
        if ch.is_ascii_alphanumeric() || ch == '_' {
            end = idx + ch.len_utf8();
        } else {
            break;
        }
    }
    Some(end)
}

fn dangerous_rm(args: &[String]) -> bool {
    if args
        .iter()
        .any(|arg| !arg.starts_with('-') && target_is_dangerous(&normalize_target(arg)))
    {
        return true;
    }

    let forced_or_recursive = args.iter().any(|arg| {
        arg == "--recursive" || arg == "--force" || recursive_flag(arg) || force_flag(arg)
    });
    if !forced_or_recursive {
        return false;
    }

    args.iter().any(|arg| {
        if arg.starts_with('-') {
            return false;
        }
        let target = normalize_target(arg);
        target_is_dangerous(&target)
    })
}

fn writes_dangerous_destination(args: &[String]) -> bool {
    args.iter()
        .rev()
        .find(|arg| !arg.starts_with('-'))
        .is_some_and(|target| target_is_dangerous(&normalize_target(target)))
}

fn writes_dangerous_file_arg(args: &[String]) -> bool {
    args.iter()
        .any(|arg| !arg.starts_with('-') && target_is_dangerous(&normalize_target(arg)))
}

fn dangerous_find(args: &[String]) -> bool {
    let target_is_dangerous = find_targets_are_dangerous(args);
    let deletes = args.iter().any(|arg| arg == "-delete");
    let writes_dangerous_file = find_writes_dangerous_file(args);
    let exec_invokes_rm = args.iter().enumerate().any(|(idx, arg)| {
        matches!(arg.as_str(), "-exec" | "-execdir" | "-ok" | "-okdir")
            && find_exec_is_rm(args, idx + 1)
    });
    let exec_is_destructive = args.iter().enumerate().any(|(idx, arg)| {
        matches!(arg.as_str(), "-exec" | "-execdir" | "-ok" | "-okdir")
            && find_exec_is_destructive(args, idx + 1)
    });
    let exec_modifies_matches = args.iter().enumerate().any(|(idx, arg)| {
        matches!(arg.as_str(), "-exec" | "-execdir" | "-ok" | "-okdir")
            && find_exec_modifies_matches(args, idx + 1)
    });

    exec_is_destructive
        || writes_dangerous_file
        || (target_is_dangerous && (deletes || exec_invokes_rm || exec_modifies_matches))
}

fn find_writes_dangerous_file(args: &[String]) -> bool {
    args.iter().enumerate().any(|(idx, arg)| {
        if arg == "-fprintf" {
            return args
                .get(idx + 1)
                .is_some_and(|target| target_is_dangerous(&normalize_target(target)));
        }
        if matches!(arg.as_str(), "-fprint" | "-fls") {
            return args
                .get(idx + 1)
                .is_some_and(|target| target_is_dangerous(&normalize_target(target)));
        }
        false
    })
}

fn find_targets_are_dangerous(args: &[String]) -> bool {
    find_target_args(args).iter().any(|target| {
        let target = normalize_target(target);
        target_is_dangerous(&target)
    })
}

fn find_target_args(args: &[String]) -> Vec<String> {
    let mut targets = Vec::new();
    let mut idx = 0;
    while idx < args.len() {
        let arg = &args[idx];
        if matches!(arg.as_str(), "-delete" | "-exec" | "-execdir") {
            break;
        }
        if matches!(arg.as_str(), "-L" | "-H" | "-P") {
            idx += 1;
            continue;
        }
        if arg.starts_with('-') {
            idx += 1;
            continue;
        }
        targets.push(arg.clone());
        idx += 1;
    }
    targets
}

fn find_exec_is_destructive(args: &[String], start: usize) -> bool {
    let exec_tokens = find_exec_tokens(args, start);
    segment_tokens_are_destructive(&exec_tokens)
}

fn find_exec_is_rm(args: &[String], start: usize) -> bool {
    let exec_tokens = find_exec_tokens(args, start);
    tokens_invoke_rm(&exec_tokens)
}

fn find_exec_modifies_matches(args: &[String], start: usize) -> bool {
    let exec_tokens = find_exec_tokens(args, start);
    tokens_modify_find_match(&exec_tokens)
}

fn find_exec_tokens(args: &[String], start: usize) -> Vec<String> {
    args[start..]
        .iter()
        .take_while(|arg| !matches!(arg.as_str(), ";" | "\\;" | "+"))
        .cloned()
        .collect()
}

fn sed_script_invokes_destructive(args: &[String]) -> bool {
    sed_script_args(args).iter().any(|arg| {
        let payloads = sed_script_payloads(arg);
        payloads
            .iter()
            .any(|payload| segment_is_destructive(payload))
            || (!payloads.is_empty()
                && shell_parameter_default_values(arg)
                    .iter()
                    .any(|payload| segment_is_destructive(payload)))
    })
}

fn sed_script_executes_shell(args: &[String]) -> bool {
    sed_script_args(args)
        .iter()
        .any(|arg| !sed_script_payloads(arg).is_empty())
}

fn sed_script_writes_dangerous_target(args: &[String]) -> bool {
    sed_script_write_targets(args)
        .iter()
        .any(|target| target_is_dangerous(&normalize_target(target)))
}

fn sed_script_writes_file(args: &[String]) -> bool {
    !sed_script_write_targets(args).is_empty()
}

fn sed_in_place_writes_dangerous_target(args: &[String]) -> bool {
    args.iter().any(|arg| sed_in_place_flag(arg))
        && args
            .iter()
            .any(|arg| !arg.starts_with('-') && target_is_dangerous(&normalize_target(arg)))
}

fn sed_script_write_targets(args: &[String]) -> Vec<String> {
    sed_script_args(args)
        .iter()
        .flat_map(|script| sed_write_targets(script))
        .collect()
}

fn sed_write_targets(script: &str) -> Vec<String> {
    script
        .split(['\n', ';'])
        .flat_map(|command| {
            command.char_indices().filter_map(|(idx, ch)| {
                if ch != 'w' {
                    return None;
                }
                let after_w = command[idx + ch.len_utf8()..].trim_start();
                (!after_w.is_empty()).then(|| {
                    after_w
                        .split_whitespace()
                        .next()
                        .unwrap_or(after_w)
                        .to_string()
                })
            })
        })
        .collect()
}

fn sed_script_args(args: &[String]) -> Vec<String> {
    let mut scripts = Vec::new();
    let mut idx = 0;
    while idx < args.len() {
        let arg = &args[idx];
        if matches!(arg.as_str(), "-e" | "--expression") {
            if let Some(script) = args.get(idx + 1) {
                scripts.push(script.clone());
            }
            idx += 2;
            continue;
        }
        if let Some(script) = arg.strip_prefix("-e") {
            if !script.is_empty() {
                scripts.push(script.to_string());
            }
            idx += 1;
            continue;
        }
        if let Some(script) = arg.strip_prefix("--expression=") {
            scripts.push(script.to_string());
            idx += 1;
            continue;
        }
        if arg.starts_with('-') {
            idx += 1;
            continue;
        }
        scripts.push(arg.clone());
        idx += 1;
    }
    scripts
}

fn sed_script_payloads(script: &str) -> Vec<String> {
    let mut payloads = script
        .split(['\n', ';'])
        .flat_map(|command| {
            command.char_indices().filter_map(|(idx, ch)| {
                if ch != 'e' {
                    return None;
                }
                let after_e = command[idx + ch.len_utf8()..].trim_start();
                let next = command[idx + ch.len_utf8()..].chars().next();
                (next.is_some_and(char::is_whitespace) && !after_e.is_empty())
                    .then(|| after_e.to_string())
            })
        })
        .collect::<Vec<_>>();
    payloads.extend(sed_substitute_exec_payloads(script));
    payloads
}

fn sed_substitute_exec_payloads(script: &str) -> Vec<String> {
    script
        .split(['\n', ';'])
        .filter_map(|command| {
            let s_idx = command.find('s')?;
            let mut chars = command[s_idx + 1..].chars();
            let delimiter = chars.next()?;
            if delimiter.is_whitespace() {
                return None;
            }
            let (pattern, rest) = take_sed_part(chars.as_str(), delimiter)?;
            let (replacement, flags) = take_sed_part(rest, delimiter)?;
            let _ = pattern;
            if !flags.contains('e') {
                return None;
            }
            let replacement = replacement.replace("\\/", "/");
            let replacement = replacement.trim();
            (!replacement.is_empty()).then(|| replacement.to_string())
        })
        .collect()
}

fn take_sed_part(input: &str, delimiter: char) -> Option<(&str, &str)> {
    let mut escaped = false;
    for (idx, ch) in input.char_indices() {
        if escaped {
            escaped = false;
            continue;
        }
        if ch == '\\' {
            escaped = true;
            continue;
        }
        if ch == delimiter {
            return Some((&input[..idx], &input[idx + ch.len_utf8()..]));
        }
    }
    None
}

fn tokens_invoke_rm(tokens: &[String]) -> bool {
    if env_split_payload_invokes_rm(tokens) {
        return true;
    }

    let Some(start) = primary_token_index(tokens) else {
        return false;
    };
    let command = command_name(&tokens[start]);
    let args = &tokens[start + 1..];

    match command {
        "rm" => true,
        "sudo" => sudo_payload_tokens(args).is_some_and(tokens_invoke_rm),
        "env" => tokens_invoke_rm(args),
        "exec" | "command" => {
            shell_wrapper_payload_tokens(command, args).is_some_and(tokens_invoke_rm)
        }
        command if is_shell_command(command) => shell_invokes_rm(args),
        _ => false,
    }
}

fn tokens_modify_dangerous_target(tokens: &[String]) -> bool {
    let Some(start) = primary_token_index(tokens) else {
        return false;
    };
    let command = command_name(&tokens[start]);
    let args = &tokens[start + 1..];
    match command {
        "rm" | "chown" | "chmod" => args
            .iter()
            .any(|arg| !arg.starts_with('-') && target_is_dangerous(&normalize_target(arg))),
        "env" => tokens_modify_dangerous_target(args),
        "exec" | "command" => {
            shell_wrapper_payload_tokens(command, args).is_some_and(tokens_modify_dangerous_target)
        }
        command if is_shell_command(command) => shell_payload_matches(args, |payload| {
            let payload_tokens = shell_words(payload);
            tokens_modify_dangerous_target(&payload_tokens)
        }),
        _ => false,
    }
}

fn tokens_modify_find_match(tokens: &[String]) -> bool {
    let Some(start) = primary_token_index(tokens) else {
        return false;
    };
    let command = command_name(&tokens[start]);
    let args = &tokens[start + 1..];
    match command {
        "rm" | "chown" | "cp" | "mv" | "truncate" => true,
        "dd" => args.iter().any(|arg| arg.starts_with("of=")),
        "chmod" => args
            .iter()
            .any(|arg| permission_is_world_writable(arg) || permission_is_destructive(arg)),
        "sed" => sed_in_place_writes_find_match(args),
        "tee" => args.iter().any(|arg| target_is_find_match(arg)),
        "sudo" => sudo_payload_tokens(args).is_some_and(tokens_modify_find_match),
        "env" => tokens_modify_find_match(args),
        "exec" | "command" => {
            shell_wrapper_payload_tokens(command, args).is_some_and(tokens_modify_find_match)
        }
        command if is_shell_command(command) => shell_payload_matches(args, |payload| {
            let payload_tokens = shell_words(payload);
            tokens_modify_find_match(&payload_tokens) || redirects_to_find_match(payload)
        }),
        _ => false,
    }
}

fn redirects_to_find_match(command: &str) -> bool {
    let tokens = shell_words(command);
    tokens_redirect_to_find_match(tokens.iter().map(String::as_str))
        || tokens_redirect_to_find_match(command.split_whitespace())
}

fn tokens_redirect_to_find_match<'a>(tokens: impl Iterator<Item = &'a str>) -> bool {
    let tokens = tokens.collect::<Vec<_>>();
    tokens.iter().enumerate().any(|(idx, token)| {
        redirection_target(token)
            .or_else(|| redirection_operator(token).and_then(|_| tokens.get(idx + 1).copied()))
            .is_some_and(target_is_find_match)
    })
}

fn target_is_find_match(target: &str) -> bool {
    normalize_target(target) == "{}"
}

fn sed_in_place_writes_find_match(args: &[String]) -> bool {
    args.iter().any(|arg| sed_in_place_flag(arg))
        && args.iter().any(|arg| target_is_find_match(arg))
}

fn env_split_payload_invokes_rm(tokens: &[String]) -> bool {
    tokens.iter().enumerate().any(|(idx, _token)| {
        env_split_payload_tokens(tokens, idx).is_some_and(|payload| tokens_invoke_rm(&payload))
    })
}

fn segment_invokes_rm(segment: &str) -> bool {
    let tokens = shell_words(segment);
    tokens_invoke_rm(&tokens)
}

fn dangerous_permission_change(args: &[String]) -> bool {
    if args
        .iter()
        .any(|arg| !arg.starts_with('-') && target_is_dangerous(&normalize_target(arg)))
    {
        return true;
    }

    let permission_change = args
        .iter()
        .any(|arg| permission_is_world_writable(arg) || permission_is_destructive(arg));
    permission_change
        && args.iter().any(|arg| {
            if arg.starts_with('-')
                || permission_is_world_writable(arg)
                || permission_is_destructive(arg)
            {
                return false;
            }
            target_is_dangerous(&normalize_target(arg))
        })
}

fn permission_is_destructive(arg: &str) -> bool {
    octal_permission_is_destructive(arg)
        || arg == "-w"
        || arg.ends_with("-w")
        || arg.contains("-rwx")
        || arg.contains("-rw")
        || arg.ends_with("=---")
        || arg == "a="
        || arg == "u="
        || arg == "g="
        || arg == "o="
}

fn permission_is_world_writable(arg: &str) -> bool {
    octal_permission_is_world_writable(arg)
        || arg == "666"
        || arg == "0666"
        || arg == "1777"
        || arg.ends_with("=rwx")
        || arg.ends_with("+rwx")
        || arg.contains("+rwx")
        || arg == "o+w"
        || arg == "o=rw"
        || arg == "o=rwx"
        || arg.ends_with("+w")
}

fn octal_permission_is_world_writable(arg: &str) -> bool {
    let digits = arg.trim_start_matches('0');
    if digits.len() < 3 || !digits.chars().all(|ch| matches!(ch, '0'..='7')) {
        return false;
    }
    digits
        .chars()
        .last()
        .and_then(|ch| ch.to_digit(8))
        .is_some_and(|mode| mode & 0o2 != 0)
}

fn octal_permission_is_destructive(arg: &str) -> bool {
    arg.len() >= 3 && arg.len() <= 4 && arg.chars().all(|ch| matches!(ch, '0'..='7'))
}

fn recursive_flag(arg: &str) -> bool {
    arg == "-r"
        || arg == "-R"
        || arg == "--recursive"
        || (arg.starts_with('-')
            && !arg.starts_with("--")
            && arg.chars().any(|ch| matches!(ch, 'r' | 'R')))
}

fn force_flag(arg: &str) -> bool {
    arg == "-f"
        || arg == "--force"
        || (arg.starts_with('-') && !arg.starts_with("--") && arg.chars().any(|ch| ch == 'f'))
}

fn is_sudo_option_with_operand(option: &str) -> bool {
    matches!(
        option,
        "-u" | "--user"
            | "-g"
            | "--group"
            | "-h"
            | "--host"
            | "-p"
            | "--prompt"
            | "-c"
            | "--close-from"
    )
}

fn normalize_target(target: &str) -> String {
    target
        .trim_matches(['"', '\''])
        .replace('\\', "/")
        .to_ascii_lowercase()
}

fn target_is_dangerous(target: &str) -> bool {
    target_is_dangerous_literal(target) || {
        let default_expanded = expand_shell_parameter_defaults(target);
        default_expanded != target
            && target_is_dangerous_literal(&normalize_target(&default_expanded))
    }
}

fn target_is_dangerous_literal(target: &str) -> bool {
    target == "/"
        || target == "/*"
        || target.starts_with('/')
        || target == "~"
        || target.starts_with("~/")
        || target.starts_with('~')
        || target == "$home"
        || target.starts_with("$home/")
        || target.starts_with("${home")
        || target.contains("..")
}

fn redirects_to_dangerous_target(command: &str) -> bool {
    let tokens = shell_words(command);
    redirection_text_targets_dangerous(command)
        || tokens_redirect_to_dangerous_target(tokens.iter().map(String::as_str))
        || tokens_redirect_to_dangerous_target(command.split_whitespace())
}

fn redirection_text_targets_dangerous(command: &str) -> bool {
    [
        ">>|", "&>>", "&>|", ">&", "&>", "2>>", "1>>", ">>", "2>", "1>", ">|", ">", "<>",
    ]
    .iter()
    .any(|operator| {
        command.match_indices(operator).any(|(idx, _)| {
            let after_operator = command[idx + operator.len()..].trim_start();
            after_operator
                .split_whitespace()
                .next()
                .is_some_and(|target| target_is_dangerous(&normalize_target(target)))
        })
    })
}

fn tokens_redirect_to_dangerous_target<'a>(tokens: impl Iterator<Item = &'a str>) -> bool {
    let tokens = tokens.collect::<Vec<_>>();
    tokens.iter().enumerate().any(|(idx, token)| {
        redirection_target(token)
            .or_else(|| redirection_operator(token).and_then(|_| tokens.get(idx + 1).copied()))
            .is_some_and(|target| target_is_dangerous(&normalize_target(target)))
    })
}

fn redirection_operator(token: &str) -> Option<&str> {
    matches!(
        token,
        ">" | ">>" | ">|" | "<>" | "2>" | "1>" | "2>>" | "1>>" | "&>>" | "&>|" | ">&" | "&>"
    )
    .then_some(token)
}

fn redirection_target(token: &str) -> Option<&str> {
    let without_fd = token.trim_start_matches(|ch: char| ch.is_ascii_digit());
    for operator in [
        "&>>", "&>|", ">&", "&>", "2>>", "1>>", ">>", "2>", "1>", ">|", ">", "<>",
    ] {
        if let Some(target) = without_fd.strip_prefix(operator)
            && !target.is_empty()
        {
            return Some(target);
        }
    }
    None
}

fn is_shell_command(command: &str) -> bool {
    matches!(
        command,
        "sh" | "bash" | "zsh" | "dash" | "ksh" | "mksh" | "fish"
    )
}

fn pipes_remote_content_to_shell(command: &str) -> bool {
    command
        .replace("|&", "|")
        .split('|')
        .collect::<Vec<_>>()
        .windows(2)
        .any(|pair| {
            primary_command_name(pair[0].trim())
                .is_some_and(|command| matches!(command.as_str(), "curl" | "wget"))
                && primary_command_name(pair[1].trim())
                    .is_some_and(|command| is_shell_command(command.as_str()))
        })
}

fn primary_command_name(segment: &str) -> Option<String> {
    let tokens = shell_words(segment);
    primary_command_name_from_tokens(&tokens)
}

fn primary_command_name_from_tokens(tokens: &[String]) -> Option<String> {
    if let Some(command) = env_split_payload_command_name(tokens) {
        return Some(command);
    }
    let start = primary_token_index(tokens)?;
    let command = command_name(&tokens[start]);
    let args = &tokens[start + 1..];
    match command {
        "sudo" => sudo_payload_tokens(args).and_then(primary_command_name_from_tokens),
        "env" => primary_command_name_from_tokens(args),
        _ => Some(command.to_string()),
    }
}

fn env_split_payload_command_name(tokens: &[String]) -> Option<String> {
    tokens.iter().enumerate().find_map(|(idx, _token)| {
        env_split_payload_tokens(tokens, idx)
            .map(|payload| primary_command_name_from_tokens(&payload))
    })?
}

fn command_requires_approval(tokens: &[String]) -> bool {
    let command = command_name(&tokens[0]);
    match command {
        "curl" | "wget" | "rm" | "mv" => true,
        "npm" => tokens
            .get(1)
            .is_some_and(|subcommand| subcommand == "install"),
        "pnpm" | "yarn" => tokens.get(1).is_some_and(|subcommand| subcommand == "add"),
        "pip" | "cargo" => tokens
            .get(1)
            .is_some_and(|subcommand| subcommand == "install"),
        "git" => tokens.get(1).is_some_and(|subcommand| subcommand == "push"),
        "rg" => rg_uses_preprocessor(tokens),
        "find" => tokens.iter().any(|arg| arg == "-delete"),
        "sed" => {
            tokens.iter().any(|arg| sed_in_place_flag(arg))
                || sed_script_executes_shell(&tokens[1..])
                || sed_script_writes_file(&tokens[1..])
        }
        _ => false,
    }
}

fn command_is_low_risk(tokens: &[String]) -> bool {
    let command = command_name(&tokens[0]);
    match command {
        "npm" | "pnpm" | "yarn" => tokens.get(1).is_some_and(|subcommand| subcommand == "test"),
        "cargo" => tokens.get(1).is_some_and(|subcommand| subcommand == "test"),
        "pytest" | "ls" | "pwd" | "cat" => true,
        "rg" => !rg_uses_preprocessor(tokens),
        "sed" => {
            tokens.get(1).is_some_and(|arg| arg == "-n")
                && !tokens.iter().any(|arg| sed_in_place_flag(arg))
                && !sed_script_executes_shell(&tokens[1..])
                && !sed_script_writes_file(&tokens[1..])
        }
        _ => false,
    }
}

fn rg_uses_preprocessor(tokens: &[String]) -> bool {
    tokens
        .iter()
        .any(|arg| arg == "--pre" || arg.starts_with("--pre="))
}

fn sed_in_place_flag(arg: &str) -> bool {
    arg == "-i" || arg.starts_with("-i") || arg == "--in-place" || arg.starts_with("--in-place=")
}

fn allow(reason: &str) -> CommandPolicyResult {
    CommandPolicyResult {
        decision: CommandDecision::Allow,
        reason: reason.to_string(),
    }
}

fn approve(reason: &str) -> CommandPolicyResult {
    CommandPolicyResult {
        decision: CommandDecision::Approve,
        reason: reason.to_string(),
    }
}

fn block(reason: &str) -> CommandPolicyResult {
    CommandPolicyResult {
        decision: CommandDecision::Block,
        reason: reason.to_string(),
    }
}
