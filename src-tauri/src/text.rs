use std::io::Read;
use std::path::Path;

pub fn truncate_chars(text: &str, max_chars: usize) -> &str {
    match text.char_indices().nth(max_chars) {
        Some((idx, _)) => &text[..idx],
        None => text,
    }
}

pub fn preview(text: &str, max_chars: usize) -> String {
    let single_line: String = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let cut = truncate_chars(&single_line, max_chars);
    if cut.len() < single_line.len() {
        format!("{cut}…")
    } else {
        cut.to_string()
    }
}

pub fn looks_binary(content: &str) -> bool {
    let sample: Vec<char> = content.chars().take(4000).collect();
    if sample.is_empty() {
        return false;
    }
    let replacement = sample.iter().filter(|c| **c == '\u{FFFD}').count();
    if replacement as f32 / sample.len() as f32 > 0.01 {
        return true;
    }
    let control = sample
        .iter()
        .filter(|c| c.is_control() && !matches!(c, '\n' | '\t' | '\r'))
        .count();
    control as f32 / sample.len() as f32 > 0.05
}

pub fn bytes_look_binary(bytes: &[u8]) -> bool {
    let sample = &bytes[..bytes.len().min(8192)];
    if sample.contains(&0) {
        return true;
    }
    let control = sample
        .iter()
        .filter(|b| **b < 0x20 && !matches!(**b, b'\n' | b'\r' | b'\t' | 0x0c | 0x1b))
        .count();
    control * 20 > sample.len()
}

pub fn chunk_text(text: &str, max_chars: usize) -> Vec<String> {
    let max_chars = max_chars.max(200);
    let mut chunks = Vec::new();
    let mut current = String::new();
    let mut current_len = 0usize;

    let push_piece =
        |piece: &str, chunks: &mut Vec<String>, current: &mut String, current_len: &mut usize| {
            let piece_len = piece.chars().count();
            if *current_len > 0 && *current_len + piece_len + 2 > max_chars {
                chunks.push(std::mem::take(current));
                *current_len = 0;
            }
            if *current_len > 0 {
                current.push_str("\n\n");
                *current_len += 2;
            }
            current.push_str(piece);
            *current_len += piece_len;
        };

    for paragraph in text.split("\n\n").map(str::trim).filter(|p| !p.is_empty()) {
        if paragraph.chars().count() <= max_chars {
            push_piece(paragraph, &mut chunks, &mut current, &mut current_len);
            continue;
        }
        for piece in split_long(paragraph, max_chars) {
            push_piece(&piece, &mut chunks, &mut current, &mut current_len);
        }
    }
    if !current.is_empty() {
        chunks.push(current);
    }
    chunks
}

fn split_long(paragraph: &str, max_chars: usize) -> Vec<String> {
    let mut pieces = Vec::new();
    let mut current = String::new();
    let mut count = 0usize;
    for word in paragraph.split_inclusive(char::is_whitespace) {
        let word_len = word.chars().count();
        if count + word_len > max_chars && !current.is_empty() {
            pieces.push(current.trim().to_string());
            current = String::new();
            count = 0;
        }
        if word_len > max_chars {
            let chars: Vec<char> = word.chars().collect();
            for part in chars.chunks(max_chars) {
                pieces.push(part.iter().collect::<String>().trim().to_string());
            }
            continue;
        }
        current.push_str(word);
        count += word_len;
    }
    if !current.trim().is_empty() {
        pieces.push(current.trim().to_string());
    }
    pieces.into_iter().filter(|p| !p.is_empty()).collect()
}

pub fn strip_reasoning(text: &str) -> String {
    let mut output = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(start) = rest.find("<think>") {
        output.push_str(&rest[..start]);
        match rest[start..].find("</think>") {
            Some(end) => rest = &rest[start + end + "</think>".len()..],
            None => {
                rest = "";
                break;
            }
        }
    }
    output.push_str(rest);
    output.trim().to_string()
}

fn strip_xml_tags(xml: &str) -> String {
    let mut out = String::with_capacity(xml.len() / 2);
    let mut in_tag = false;
    for c in xml.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    out
}

pub fn decode_xml_entities(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut rest = input;
    while let Some(amp) = rest.find('&') {
        out.push_str(&rest[..amp]);
        let tail = &rest[amp..];
        let Some(semi) = tail.find(';').filter(|idx| *idx <= 10) else {
            out.push('&');
            rest = &tail[1..];
            continue;
        };
        let entity = &tail[1..semi];
        let decoded = match entity {
            "lt" => Some('<'),
            "gt" => Some('>'),
            "amp" => Some('&'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            _ if entity.starts_with("#x") || entity.starts_with("#X") => {
                u32::from_str_radix(&entity[2..], 16)
                    .ok()
                    .and_then(char::from_u32)
            }
            _ if entity.starts_with('#') => {
                entity[1..].parse::<u32>().ok().and_then(char::from_u32)
            }
            _ => None,
        };
        match decoded {
            Some(c) => {
                out.push(c);
                rest = &tail[semi + 1..];
            }
            None => {
                out.push('&');
                rest = &tail[1..];
            }
        }
    }
    out.push_str(rest);
    out
}

const MAX_XML_BYTES: u64 = 64 * 1024 * 1024;

fn read_zip_entry(bytes: &[u8], name: &str) -> Option<String> {
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).ok()?;
    let entry = archive.by_name(name).ok()?;
    if entry.size() > MAX_XML_BYTES {
        return None;
    }
    let mut xml = String::new();
    entry
        .take(MAX_XML_BYTES + 1)
        .read_to_string(&mut xml)
        .ok()?;
    (xml.len() as u64 <= MAX_XML_BYTES).then_some(xml)
}

fn normalize_lines(text: &str) -> Option<String> {
    let joined = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    if joined.is_empty() {
        None
    } else {
        Some(joined)
    }
}

pub fn extract_docx_text(bytes: &[u8]) -> Option<String> {
    let xml = read_zip_entry(bytes, "word/document.xml")?
        .replace("</w:p>", "\n")
        .replace("</w:tr>", "\n")
        .replace("<w:tab/>", "\t")
        .replace("<w:br/>", "\n");
    normalize_lines(&decode_xml_entities(&strip_xml_tags(&xml)))
}

pub fn extract_odt_text(bytes: &[u8]) -> Option<String> {
    let xml = read_zip_entry(bytes, "content.xml")?
        .replace("</text:p>", "\n")
        .replace("</text:h>", "\n")
        .replace("<text:tab/>", "\t")
        .replace("<text:line-break/>", "\n")
        .replace("<text:s/>", " ");
    normalize_lines(&decode_xml_entities(&strip_xml_tags(&xml)))
}

pub fn text_from_file(path: &Path, bytes: &[u8]) -> Option<String> {
    match crate::paths::extension_of(path).as_str() {
        "docx" => return extract_docx_text(bytes),
        "odt" => return extract_odt_text(bytes),
        _ => {}
    }
    let text = match std::str::from_utf8(bytes) {
        Ok(text) => text.to_string(),
        Err(_) => String::from_utf8_lossy(bytes).into_owned(),
    };
    let text = text.trim_start_matches('\u{FEFF}').to_string();
    if looks_binary(&text) {
        None
    } else {
        Some(text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncates_on_char_boundaries() {
        let text = "سلام دنیا";
        assert_eq!(truncate_chars(text, 4), "سلام");
        assert_eq!(truncate_chars(text, 100), text);
        assert_eq!(truncate_chars("", 3), "");
    }

    #[test]
    fn detects_binary_bytes() {
        assert!(!bytes_look_binary(b"caf\xe9 cr\xe8me br\xfbl\xe9e"));
        assert!(bytes_look_binary(b"PK\x03\x04\x00\x00"));
        assert!(!bytes_look_binary(b""));
    }

    #[test]
    fn detects_binary_content() {
        assert!(!looks_binary("Plain study notes\nwith lines"));
        assert!(looks_binary("\u{0}\u{1}\u{2}\u{3}abc"));
        assert!(!looks_binary(""));
    }

    #[test]
    fn chunks_text_without_exceeding_limit() {
        let paragraph = "word ".repeat(200);
        let text = format!("{paragraph}\n\n{paragraph}\n\nshort");
        let chunks = chunk_text(&text, 300);
        assert!(chunks.len() > 2);
        for chunk in &chunks {
            assert!(
                chunk.chars().count() <= 300,
                "chunk too long: {}",
                chunk.chars().count()
            );
        }
        let rejoined: String = chunks.join(" ");
        assert!(rejoined.contains("short"));
    }

    #[test]
    fn chunks_multibyte_text() {
        let text = "یادگیری ".repeat(500);
        let chunks = chunk_text(&text, 250);
        assert!(chunks.iter().all(|c| c.chars().count() <= 250));
        assert!(!chunks.is_empty());
    }

    #[test]
    fn strips_reasoning_blocks() {
        assert_eq!(strip_reasoning("<think>hmm</think>[1]"), "[1]");
        assert_eq!(
            strip_reasoning("a<think>x</think>b<think>y</think>c"),
            "abc"
        );
        assert_eq!(strip_reasoning("<think>never closed"), "");
    }

    #[test]
    fn decodes_entities() {
        assert_eq!(
            decode_xml_entities("a &lt; b &amp;&amp; c &#65;&#x42;"),
            "a < b && c AB"
        );
        assert_eq!(decode_xml_entities("fish & chips"), "fish & chips");
    }

    #[test]
    fn previews_are_single_line() {
        assert_eq!(preview("a\n\nb   c", 10), "a b c");
        assert_eq!(preview("abcdef", 3), "abc…");
    }
}
