use serde_json::Value;

use crate::text::{strip_reasoning, truncate_chars};

const FRONT_KEYS: [&str; 5] = ["front", "question", "term", "q", "prompt"];
const BACK_KEYS: [&str; 5] = ["back", "answer", "definition", "a", "explanation"];

fn text_field(map: &serde_json::Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| {
            map.get(*key).and_then(|value| match value {
                Value::String(s) => Some(s.trim().to_string()),
                Value::Number(n) => Some(n.to_string()),
                Value::Array(items) => Some(
                    items
                        .iter()
                        .filter_map(|item| item.as_str())
                        .collect::<Vec<_>>()
                        .join(", "),
                ),
                _ => None,
            })
        })
        .filter(|s| !s.is_empty())
}

fn collect_cards(value: &Value, out: &mut Vec<(String, String)>) {
    match value {
        Value::Object(map) => {
            if let (Some(front), Some(back)) =
                (text_field(map, &FRONT_KEYS), text_field(map, &BACK_KEYS))
            {
                out.push((front, back));
                return;
            }
            for child in map.values() {
                collect_cards(child, out);
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_cards(item, out);
            }
        }
        Value::String(s) => {
            let trimmed = s.trim();
            if trimmed.starts_with('[') || trimmed.starts_with('{') {
                if let Ok(inner) = serde_json::from_str::<Value>(trimmed) {
                    collect_cards(&inner, out);
                }
            }
        }
        _ => {}
    }
}

fn strip_fences(text: &str) -> &str {
    let trimmed = text.trim();
    let without_open = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```JSON"))
        .or_else(|| trimmed.strip_prefix("```"))
        .unwrap_or(trimmed);
    without_open
        .strip_suffix("```")
        .unwrap_or(without_open)
        .trim()
}

const LATEX_COMMANDS: &[&str] = &[
    "nabla",
    "ne",
    "neq",
    "neg",
    "nu",
    "not",
    "notin",
    "ni",
    "nmid",
    "nleq",
    "ngeq",
    "nless",
    "ngtr",
    "nexists",
    "newline",
    "natural",
    "nearrow",
    "nwarrow",
    "nsubseteq",
    "nsupseteq",
    "nparallel",
    "nrightarrow",
    "nleftarrow",
    "rho",
    "right",
    "rightarrow",
    "rightleftharpoons",
    "rightharpoonup",
    "rangle",
    "rceil",
    "rfloor",
    "rbrace",
    "rbrack",
    "rvert",
    "rVert",
    "rm",
    "rtimes",
    "times",
    "theta",
    "tan",
    "tanh",
    "tau",
    "text",
    "textbf",
    "textit",
    "textrm",
    "texttt",
    "textsf",
    "textstyle",
    "tfrac",
    "tbinom",
    "tilde",
    "to",
    "top",
    "triangle",
    "triangleq",
    "therefore",
    "tiny",
];

fn is_latex_escape(chars: &[char], index: usize) -> bool {
    let name: String = chars[index + 1..]
        .iter()
        .take(32)
        .take_while(|c| c.is_ascii_alphabetic())
        .collect();
    match name.chars().next() {
        Some('b') | Some('f') => name.len() > 1,
        Some('n') | Some('r') | Some('t') => LATEX_COMMANDS.contains(&name.as_str()),
        _ => false,
    }
}

pub fn repair_json(raw: &str) -> String {
    let chars: Vec<char> = raw.chars().collect();
    let mut out = String::with_capacity(raw.len() + 16);
    let mut in_string = false;
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        if !in_string {
            if c == '"' {
                in_string = true;
            } else if c == ',' {
                let next = chars[i + 1..].iter().find(|c| !c.is_whitespace());
                if matches!(next, Some('}') | Some(']')) {
                    i += 1;
                    continue;
                }
            }
            out.push(c);
            i += 1;
            continue;
        }
        match c {
            '"' => {
                in_string = false;
                out.push(c);
            }
            '\n' => out.push_str("\\n"),
            '\t' => out.push_str("\\t"),
            '\r' => {}
            '\\' => match chars.get(i + 1).copied() {
                Some(next @ ('\\' | '"' | '/')) => {
                    out.push('\\');
                    out.push(next);
                    i += 1;
                }
                Some('u')
                    if chars
                        .get(i + 2..i + 6)
                        .is_some_and(|hex| hex.iter().all(|c| c.is_ascii_hexdigit())) =>
                {
                    out.push('\\');
                }
                Some(next @ ('b' | 'f' | 'n' | 'r' | 't')) if !is_latex_escape(&chars, i) => {
                    out.push('\\');
                    out.push(next);
                    i += 1;
                }
                _ => out.push_str("\\\\"),
            },
            _ => out.push(c),
        }
        i += 1;
    }
    out
}

fn parse_loose(candidate: &str) -> Option<Value> {
    serde_json::from_str::<Value>(&repair_json(candidate))
        .or_else(|_| serde_json::from_str::<Value>(candidate))
        .ok()
}

fn balanced_end(bytes: &[u8], start: usize) -> Option<usize> {
    let mut stack: Vec<u8> = Vec::new();
    let mut in_string = false;
    let mut escaped = false;
    for (offset, &ch) in bytes[start..].iter().enumerate() {
        if in_string {
            if escaped {
                escaped = false;
            } else if ch == b'\\' {
                escaped = true;
            } else if ch == b'"' {
                in_string = false;
            }
            continue;
        }
        match ch {
            b'"' => in_string = true,
            b'{' | b'[' => stack.push(ch),
            b'}' | b']' => {
                let expected = if ch == b'}' { b'{' } else { b'[' };
                if stack.pop() != Some(expected) {
                    return None;
                }
                if stack.is_empty() {
                    return Some(start + offset);
                }
            }
            _ => {}
        }
    }
    None
}

fn salvage_cards(text: &str, cards: &mut Vec<(String, String)>) {
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'{' || bytes[i] == b'[' {
            if let Some(end) = balanced_end(bytes, i) {
                if let Some(value) = parse_loose(&text[i..=end]) {
                    let before = cards.len();
                    collect_cards(&value, cards);
                    if cards.len() > before {
                        i = end + 1;
                        continue;
                    }
                }
            }
        }
        i += 1;
    }
}

pub fn parse_flashcards(raw: &str) -> Result<Vec<(String, String)>, String> {
    let cleaned = strip_reasoning(raw);
    let candidate = strip_fences(&cleaned);

    if let Some(value) = parse_loose(candidate) {
        let mut cards = Vec::new();
        collect_cards(&value, &mut cards);
        if !cards.is_empty() || value.is_array() {
            return Ok(dedupe(cards));
        }
    }

    let mut cards = Vec::new();
    salvage_cards(&cleaned, &mut cards);
    if !cards.is_empty() {
        return Ok(dedupe(cards));
    }

    Err(format!(
        "The AI response did not contain flashcards. Response started with: {}",
        truncate_chars(cleaned.trim(), 300)
    ))
}

fn dedupe(cards: Vec<(String, String)>) -> Vec<(String, String)> {
    let mut seen = std::collections::HashSet::new();
    cards
        .into_iter()
        .filter(|(front, back)| seen.insert((front.to_lowercase(), back.to_lowercase())))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_plain_array() {
        let cards =
            parse_flashcards(r#"[{"front":"Q1","back":"A1"},{"front":"Q2","back":"A2"}]"#).unwrap();
        assert_eq!(
            cards,
            vec![("Q1".into(), "A1".into()), ("Q2".into(), "A2".into())]
        );
    }

    #[test]
    fn parses_fenced_and_wrapped_output() {
        let raw = "Sure! Here you go:\n```json\n{\"cards\":[{\"question\":\"What is H2O?\",\"answer\":\"Water\"}]}\n```\nEnjoy";
        let cards = parse_flashcards(raw).unwrap();
        assert_eq!(cards, vec![("What is H2O?".into(), "Water".into())]);
    }

    #[test]
    fn parses_objects_scattered_in_prose() {
        let raw = r#"First {"front":"a","back":"b"} then {"term":"c","definition":"d"}"#;
        let cards = parse_flashcards(raw).unwrap();
        assert_eq!(cards.len(), 2);
    }

    #[test]
    fn ignores_reasoning_and_handles_unicode() {
        let raw = "<think>let me think about braces { [ </think>[{\"front\":\"avaricious\",\"back\":\"حریص\"}]";
        let cards = parse_flashcards(raw).unwrap();
        assert_eq!(cards, vec![("avaricious".into(), "حریص".into())]);
    }

    #[test]
    fn empty_array_is_valid() {
        assert!(parse_flashcards("[]").unwrap().is_empty());
    }

    #[test]
    fn reports_unparseable_output_without_panicking() {
        let raw = "متن بدون هیچ ساختاری ".repeat(50);
        let err = parse_flashcards(&raw).unwrap_err();
        assert!(err.contains("did not contain flashcards"));
    }

    #[test]
    fn removes_duplicates() {
        let cards =
            parse_flashcards(r#"[{"front":"A","back":"B"},{"front":"a","back":"b"}]"#).unwrap();
        assert_eq!(cards.len(), 1);
    }

    #[test]
    fn finds_balanced_blocks_with_nested_strings() {
        let text = r#"x {"a":"}{","b":[1,2]} y [3]"#;
        let start = text.find('{').unwrap();
        let end = balanced_end(text.as_bytes(), start).unwrap();
        assert_eq!(&text[start..=end], r#"{"a":"}{","b":[1,2]}"#);
        assert_eq!(balanced_end(b"[1, 2", 0), None);
    }

    #[test]
    fn repairs_latex_and_trailing_commas() {
        let raw = r#"[{"front":"What is $\frac{1}{2}$ of $\alpha$?","back":"$\theta$ \nabla"},]"#;
        let cards = parse_flashcards(raw).unwrap();
        assert_eq!(
            cards,
            vec![(
                r"What is $\frac{1}{2}$ of $\alpha$?".to_string(),
                r"$\theta$ \nabla".to_string()
            )]
        );
        let newline = parse_flashcards(r#"[{"front":"a\nb","back":"c"}]"#).unwrap();
        assert_eq!(newline[0].0, "a\nb");
    }

    #[test]
    fn salvages_valid_cards_around_broken_ones() {
        let raw = r#"[{"front":"Q1","back":"A1"},{"front":"Q2 "bad" quote","back":"A2"},{"front":"Q3","back":"A3"}]"#;
        let cards = parse_flashcards(raw).unwrap();
        assert_eq!(
            cards,
            vec![("Q1".into(), "A1".into()), ("Q3".into(), "A3".into())]
        );
    }
}
