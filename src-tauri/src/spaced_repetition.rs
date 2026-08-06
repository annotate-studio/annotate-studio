use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Flashcard {
    pub id: String,
    pub front: String,
    pub back: String,
    pub source_file: Option<String>,
    pub source_context: Option<String>,
    pub ease_factor: f64,
    pub interval_days: i32,
    pub repetitions: i32,
    pub next_review: String,
    pub created_at: String,
    pub last_reviewed: Option<String>,
    #[serde(rename = "collectionId")]
    pub collection_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
pub enum ReviewQuality {
    Again,
    Hard,
    Good,
    Easy,
}

impl ReviewQuality {
    pub fn score(&self) -> f64 {
        match self {
            ReviewQuality::Again => 0.0,
            ReviewQuality::Hard => 2.0,
            ReviewQuality::Good => 3.0,
            ReviewQuality::Easy => 4.0,
        }
    }
}

impl Flashcard {
    pub fn new(
        front: String,
        back: String,
        source_file: Option<String>,
        source_context: Option<String>,
    ) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            front,
            back,
            source_file,
            source_context,
            ease_factor: 2.5,
            interval_days: 1,
            repetitions: 0,
            next_review: now.to_rfc3339(),
            created_at: now.to_rfc3339(),
            last_reviewed: None,
            collection_id: None,
        }
    }

    /// SM-2 spaced repetition algorithm
    pub fn review(&mut self, quality: &ReviewQuality) {
        let quality_score = quality.score();

        self.repetitions += 1;
        self.last_reviewed = Some(Utc::now().to_rfc3339());

        if quality_score < 2.0 {
            // Failed — reset interval
            self.repetitions = 0;
            self.interval_days = 1;
        } else {
            match self.repetitions {
                1 => self.interval_days = 1,
                2 => self.interval_days = 6,
                _ => {
                    self.interval_days =
                        (self.interval_days as f64 * self.ease_factor).round() as i32;
                }
            }
        }

        // Update ease factor (SM-2 formula)
        self.ease_factor =
            self.ease_factor + (0.1 - (3.0 - quality_score) * (0.08 + (3.0 - quality_score) * 0.02));

        if self.ease_factor < 1.3 {
            self.ease_factor = 1.3;
        }

        self.next_review =
            (Utc::now() + chrono::Duration::days(self.interval_days as i64)).to_rfc3339();
    }

    pub fn is_due(&self) -> bool {
        if let Ok(next) = DateTime::parse_from_rfc3339(&self.next_review) {
            next <= Utc::now()
        } else {
            true
        }
    }
}

pub struct SpacedRepetitionEngine {
    cards: Vec<Flashcard>,
    persist_path: Option<std::path::PathBuf>,
}

impl SpacedRepetitionEngine {
    pub fn new() -> Self {
        Self { cards: Vec::new(), persist_path: None }
    }

    pub fn with_cards(cards: Vec<Flashcard>) -> Self {
        Self { cards, persist_path: None }
    }

    pub fn with_persistence(mut self, path: std::path::PathBuf) -> Self {
        if let Ok(Some(cards)) = Self::load_from_disk(&path) {
            self.cards = cards;
        }
        self.persist_path = Some(path);
        self
    }

    fn load_from_disk(path: &std::path::Path) -> Result<Option<Vec<Flashcard>>, String> {
        if !path.exists() { return Ok(None); }
        let data = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
        serde_json::from_str(&data).map(Some).map_err(|e| e.to_string())
    }

    pub fn save(&self) {
        self.save_to_disk();
    }

    fn save_to_disk(&self) {
        if let Some(ref path) = self.persist_path {
            if let Ok(json) = serde_json::to_string_pretty(&self.cards) {
                std::fs::write(path, json).ok();
            }
        }
    }

    pub fn add_card(&mut self, card: Flashcard) {
        self.cards.push(card);
        self.save_to_disk();
    }

    pub fn set_cards(&mut self, cards: Vec<Flashcard>) {
        self.cards = cards;
        self.save_to_disk();
    }

    pub fn remove_card(&mut self, id: &str) -> bool {
        let len_before = self.cards.len();
        self.cards.retain(|c| c.id != id);
        let removed = self.cards.len() < len_before;
        if removed { self.save_to_disk(); }
        removed
    }

    pub fn remove_cards_by_collection(&mut self, collection_id: &str) -> usize {
        let len_before = self.cards.len();
        let target = if collection_id == "default" { None } else { Some(collection_id.to_string()) };
        self.cards.retain(|c| c.collection_id != target);
        let removed = len_before - self.cards.len();
        if removed > 0 { self.save_to_disk(); }
        removed
    }

    pub fn due_cards(&self) -> Vec<&Flashcard> {
        self.cards.iter().filter(|c| c.is_due()).collect()
    }

    pub fn get_card(&self, id: &str) -> Option<&Flashcard> {
        self.cards.iter().find(|c| c.id == id)
    }

    pub fn get_card_mut(&mut self, id: &str) -> Option<&mut Flashcard> {
        self.cards.iter_mut().find(|c| c.id == id)
    }

    pub fn all_cards(&self) -> &[Flashcard] {
        &self.cards
    }

    pub fn restore_all(&mut self, period_days: Option<f64>) {
        let now = Utc::now();
        for card in &mut self.cards {
            card.repetitions = 0;
            card.interval_days = 1;
            card.ease_factor = 2.5;
            card.last_reviewed = None;
            if let Some(days) = period_days {
                let secs = (days * 86400.0) as i64;
                card.next_review = (now + chrono::Duration::seconds(secs)).to_rfc3339();
            } else {
                card.next_review = now.to_rfc3339();
            }
        }
        self.save_to_disk();
    }

    pub fn cards_by_filter(&self, due: bool, new_cards: bool, young: bool, mature: bool) -> Vec<&Flashcard> {
        self.cards.iter().filter(|c| {
            if due && c.is_due() { return true; }
            if new_cards && c.repetitions == 0 { return true; }
            if young && c.interval_days >= 1 && c.interval_days < 21 { return true; }
            if mature && c.interval_days >= 21 { return true; }
            false
        }).collect()
    }

    pub fn due_count(&self) -> usize {
        self.due_cards().len()
    }

    pub fn stats(&self) -> RepetitionStats {
        let total = self.cards.len();
        let due = self.due_cards().len();
        let mature = self
            .cards
            .iter()
            .filter(|c| c.interval_days >= 21)
            .count();
        let young = self
            .cards
            .iter()
            .filter(|c| c.interval_days >= 1 && c.interval_days < 21)
            .count();
        let new_cards = self.cards.iter().filter(|c| c.repetitions == 0).count();

        RepetitionStats {
            total,
            due,
            mature,
            young,
            new_cards,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RepetitionStats {
    pub total: usize,
    pub due: usize,
    pub mature: usize,
    pub young: usize,
    pub new_cards: usize,
}
