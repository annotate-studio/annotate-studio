use chrono::{DateTime, Local};
use serde::{Deserialize, Serialize};
use std::io::{BufRead, Write};
use std::path::PathBuf;
use std::sync::Mutex;

use crate::storage::read_json;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudyActivity {
    pub id: String,
    pub activity_type: String,
    pub label: String,
    pub duration_seconds: u64,
    #[serde(default)]
    pub metadata: Option<String>,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct StudyStats {
    pub total_study_minutes: u64,
    pub today_study_minutes: u64,
    pub pomodoro_sessions: u64,
    pub today_pomodoro_sessions: u64,
    pub flashcards_reviewed: u64,
    pub today_flashcards_reviewed: u64,
    pub exams_taken: u64,
}

pub struct Analytics {
    path: PathBuf,
    lock: Mutex<()>,
}

fn is_today(timestamp: &str) -> bool {
    DateTime::parse_from_rfc3339(timestamp)
        .map(|date| date.with_timezone(&Local).date_naive() == Local::now().date_naive())
        .unwrap_or(false)
}

impl Analytics {
    pub fn new(data_dir: PathBuf) -> Self {
        std::fs::create_dir_all(&data_dir).ok();
        let analytics = Self {
            path: data_dir.join("activities.jsonl"),
            lock: Mutex::new(()),
        };
        analytics.migrate_legacy(&data_dir.join("activities.json"));
        analytics
    }

    fn migrate_legacy(&self, legacy: &PathBuf) {
        if self.path.exists() || !legacy.exists() {
            return;
        }
        let Some(activities) = read_json::<Vec<StudyActivity>>(legacy) else {
            return;
        };
        let lines: Vec<String> = activities
            .iter()
            .filter_map(|activity| serde_json::to_string(activity).ok())
            .collect();
        let mut content = lines.join("\n");
        if !content.is_empty() {
            content.push('\n');
        }
        if crate::storage::write_atomic(&self.path, content.as_bytes()).is_ok() {
            let _ = std::fs::rename(legacy, legacy.with_extension("json.migrated"));
        }
    }

    pub fn log(
        &self,
        activity_type: &str,
        label: &str,
        duration_seconds: u64,
        metadata: Option<String>,
    ) -> Result<(), String> {
        let activity = StudyActivity {
            id: uuid::Uuid::new_v4().to_string(),
            activity_type: activity_type.to_string(),
            label: label.to_string(),
            duration_seconds,
            metadata,
            timestamp: Local::now().to_rfc3339(),
        };
        let line = serde_json::to_string(&activity).map_err(|e| e.to_string())?;
        let _guard = self.lock.lock().map_err(|e| e.to_string())?;
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)
            .map_err(|e| format!("Failed to open the activity log: {e}"))?;
        writeln!(file, "{line}").map_err(|e| format!("Failed to write the activity log: {e}"))
    }

    fn activities(&self) -> Vec<StudyActivity> {
        let Ok(file) = std::fs::File::open(&self.path) else {
            return Vec::new();
        };
        std::io::BufReader::new(file)
            .lines()
            .map_while(Result::ok)
            .filter_map(|line| serde_json::from_str(&line).ok())
            .collect()
    }

    pub fn stats(&self) -> Result<StudyStats, String> {
        let activities = {
            let _guard = self.lock.lock().map_err(|e| e.to_string())?;
            self.activities()
        };
        let mut stats = StudyStats::default();
        let mut total_seconds = 0u64;
        let mut today_seconds = 0u64;
        for activity in &activities {
            let today = is_today(&activity.timestamp);
            total_seconds += activity.duration_seconds;
            if today {
                today_seconds += activity.duration_seconds;
            }
            match activity.activity_type.as_str() {
                "pomodoro" => {
                    stats.pomodoro_sessions += 1;
                    if today {
                        stats.today_pomodoro_sessions += 1;
                    }
                }
                "flashcard_review" => {
                    stats.flashcards_reviewed += 1;
                    if today {
                        stats.today_flashcards_reviewed += 1;
                    }
                }
                "exam" => stats.exams_taken += 1,
                _ => {}
            }
        }
        stats.total_study_minutes = total_seconds / 60;
        stats.today_study_minutes = today_seconds / 60;
        Ok(stats)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aggregates_today_activity() {
        let dir = std::env::temp_dir().join(format!("annotate-analytics-{}", uuid::Uuid::new_v4()));
        let analytics = Analytics::new(dir.clone());
        analytics.log("pomodoro", "Focus", 1500, None).unwrap();
        analytics.log("flashcard_review", "Card", 0, None).unwrap();
        let stats = analytics.stats().unwrap();
        assert_eq!(stats.pomodoro_sessions, 1);
        assert_eq!(stats.today_pomodoro_sessions, 1);
        assert_eq!(stats.today_study_minutes, 25);
        assert_eq!(stats.today_flashcards_reviewed, 1);
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn migrates_legacy_json_log() {
        let dir = std::env::temp_dir().join(format!("annotate-analytics-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let legacy = vec![StudyActivity {
            id: "1".into(),
            activity_type: "pomodoro".into(),
            label: "old".into(),
            duration_seconds: 60,
            metadata: None,
            timestamp: "2020-01-01T00:00:00+00:00".into(),
        }];
        crate::storage::write_json(&dir.join("activities.json"), &legacy).unwrap();
        let analytics = Analytics::new(dir.clone());
        let stats = analytics.stats().unwrap();
        assert_eq!(stats.pomodoro_sessions, 1);
        assert_eq!(stats.total_study_minutes, 1);
        assert!(dir.join("activities.json.migrated").exists());
        std::fs::remove_dir_all(dir).unwrap();
    }
}
