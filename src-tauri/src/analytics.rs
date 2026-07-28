use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudyActivity {
    pub id: String,
    pub activity_type: String, // "pomodoro" | "flashcard_review" | "document_read" | "note_write" | "exam"
    pub label: String,
    pub duration_seconds: u64,
    pub metadata: Option<String>,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExamResult {
    pub id: String,
    pub subject: String,
    pub title: String,
    pub score: f64,
    pub total: f64,
    pub percentage: f64,
    pub date: String,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudyStats {
    pub total_study_minutes: u64,
    pub pomodoro_sessions: u64,
    pub flashcards_reviewed: u64,
    pub documents_read: u64,
    pub exams_taken: u64,
}

pub struct Analytics {
    data_dir: PathBuf,
}

impl Analytics {
    pub fn new(data_dir: PathBuf) -> Self {
        fs::create_dir_all(&data_dir).ok();
        Self { data_dir }
    }

    fn activities_path(&self) -> PathBuf {
        self.data_dir.join("activities.json")
    }

    fn exams_path(&self) -> PathBuf {
        self.data_dir.join("exams.json")
    }

    fn read_json<T: serde::de::DeserializeOwned>(path: &PathBuf) -> Vec<T> {
        fs::read_to_string(path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    fn write_json<T: Serialize>(path: &PathBuf, data: &[T]) -> Result<(), String> {
        let json = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
        fs::write(path, json).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn log_activity(&self, activity: StudyActivity) -> Result<(), String> {
        let mut activities: Vec<StudyActivity> = Self::read_json(&self.activities_path());
        activities.push(activity);
        Self::write_json(&self.activities_path(), &activities)
    }

    pub fn get_stats(&self) -> Result<StudyStats, String> {
        let activities: Vec<StudyActivity> = Self::read_json(&self.activities_path());
        Ok(StudyStats {
            total_study_minutes: activities.iter().map(|a| a.duration_seconds).sum::<u64>() / 60,
            pomodoro_sessions: activities.iter().filter(|a| a.activity_type == "pomodoro").count() as u64,
            flashcards_reviewed: activities.iter().filter(|a| a.activity_type == "flashcard_review").count() as u64,
            documents_read: activities.iter().filter(|a| a.activity_type == "document_read").count() as u64,
            exams_taken: activities.iter().filter(|a| a.activity_type == "exam").count() as u64,
        })
    }

    pub fn save_exam(&self, exam: ExamResult) -> Result<(), String> {
        let mut exams: Vec<ExamResult> = Self::read_json(&self.exams_path());
        exams.push(exam);
        Self::write_json(&self.exams_path(), &exams)
    }

    pub fn get_exams(&self) -> Result<Vec<ExamResult>, String> {
        Ok(Self::read_json(&self.exams_path()))
    }

    pub fn get_today_minutes(&self) -> Result<u64, String> {
        let activities: Vec<StudyActivity> = Self::read_json(&self.activities_path());
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        Ok(activities
            .iter()
            .filter(|a| a.timestamp.starts_with(&today))
            .map(|a| a.duration_seconds)
            .sum::<u64>()
            / 60)
    }
}
