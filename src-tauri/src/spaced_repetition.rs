use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use uuid::Uuid;

use crate::storage::{read_json_or_default, write_json};

const MIN_EASE: f64 = 1.3;
const MAX_EASE: f64 = 5.0;
const DEFAULT_EASE: f64 = 2.5;
const MAX_INTERVAL_DAYS: i32 = 36_500;
const MATURE_INTERVAL_DAYS: i32 = 21;

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
pub enum ReviewQuality {
    Again,
    Hard,
    Good,
    Easy,
}

fn default_ease() -> f64 {
    DEFAULT_EASE
}

fn now_rfc3339() -> String {
    Utc::now().to_rfc3339()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Flashcard {
    pub id: String,
    pub front: String,
    pub back: String,
    #[serde(default)]
    pub source_file: Option<String>,
    #[serde(default)]
    pub source_context: Option<String>,
    #[serde(default = "default_ease")]
    pub ease_factor: f64,
    #[serde(default)]
    pub interval_days: i32,
    #[serde(default)]
    pub repetitions: i32,
    #[serde(default)]
    pub lapses: i32,
    #[serde(default = "now_rfc3339")]
    pub next_review: String,
    #[serde(default = "now_rfc3339")]
    pub created_at: String,
    #[serde(default)]
    pub last_reviewed: Option<String>,
    #[serde(default)]
    pub last_quality: Option<ReviewQuality>,
    #[serde(rename = "collectionId", default)]
    pub collection_id: Option<String>,
}

fn grow(previous: i32, factor: f64) -> i32 {
    let previous = previous.clamp(0, MAX_INTERVAL_DAYS);
    let scaled = (previous.max(1) as f64 * factor)
        .round()
        .min(MAX_INTERVAL_DAYS as f64) as i32;
    scaled.max(previous + 1).min(MAX_INTERVAL_DAYS)
}

fn after_delay(now: DateTime<Utc>, delay: Duration) -> DateTime<Utc> {
    now.checked_add_signed(delay)
        .unwrap_or(DateTime::<Utc>::MAX_UTC)
}

impl Flashcard {
    pub fn new(
        front: String,
        back: String,
        source_file: Option<String>,
        collection_id: Option<String>,
    ) -> Self {
        let now = Utc::now().to_rfc3339();
        Self {
            id: Uuid::new_v4().to_string(),
            front,
            back,
            source_file,
            source_context: None,
            ease_factor: DEFAULT_EASE,
            interval_days: 0,
            repetitions: 0,
            lapses: 0,
            next_review: now.clone(),
            created_at: now,
            last_reviewed: None,
            last_quality: None,
            collection_id,
        }
    }

    pub fn is_new(&self) -> bool {
        self.last_reviewed.is_none() && self.repetitions == 0
    }

    pub fn due_at(&self) -> Option<DateTime<Utc>> {
        DateTime::parse_from_rfc3339(&self.next_review)
            .ok()
            .map(|date| date.with_timezone(&Utc))
    }

    pub fn is_due_at(&self, now: DateTime<Utc>) -> bool {
        self.due_at().map(|due| due <= now).unwrap_or(true)
    }

    pub fn review_at(&mut self, quality: ReviewQuality, now: DateTime<Utc>) {
        let previous = self.interval_days.clamp(0, MAX_INTERVAL_DAYS);
        if !self.ease_factor.is_finite() {
            self.ease_factor = DEFAULT_EASE;
        }
        self.ease_factor = self.ease_factor.clamp(MIN_EASE, MAX_EASE);
        self.repetitions = self.repetitions.max(0);
        let delay = match quality {
            ReviewQuality::Again => {
                self.lapses = self.lapses.saturating_add(1);
                self.repetitions = 0;
                self.ease_factor = (self.ease_factor - 0.2).max(MIN_EASE);
                self.interval_days = 0;
                Duration::minutes(10)
            }
            ReviewQuality::Hard => {
                self.ease_factor = (self.ease_factor - 0.15).max(MIN_EASE);
                self.interval_days = if self.repetitions == 0 {
                    1
                } else {
                    grow(previous, 1.2)
                };
                self.repetitions = self.repetitions.saturating_add(1);
                Duration::days(self.interval_days as i64)
            }
            ReviewQuality::Good => {
                self.interval_days = match self.repetitions {
                    0 => 1,
                    1 => 6.max(previous + 1).min(MAX_INTERVAL_DAYS),
                    _ => grow(previous, self.ease_factor),
                };
                self.repetitions = self.repetitions.saturating_add(1);
                Duration::days(self.interval_days as i64)
            }
            ReviewQuality::Easy => {
                self.interval_days = match self.repetitions {
                    0 => 4,
                    1 => 8.max(previous + 1).min(MAX_INTERVAL_DAYS),
                    _ => grow(previous, self.ease_factor * 1.3),
                };
                self.ease_factor = (self.ease_factor + 0.15).min(MAX_EASE);
                self.repetitions = self.repetitions.saturating_add(1);
                Duration::days(self.interval_days as i64)
            }
        };
        self.last_reviewed = Some(now.to_rfc3339());
        self.last_quality = Some(quality);
        self.next_review = after_delay(now, delay).to_rfc3339();
    }

    pub fn reset(&mut self, due: DateTime<Utc>) {
        self.ease_factor = DEFAULT_EASE;
        self.interval_days = 0;
        self.repetitions = 0;
        self.lapses = 0;
        self.last_reviewed = None;
        self.last_quality = None;
        self.next_review = due.to_rfc3339();
    }
}

#[derive(Debug, Serialize, Deserialize, Default, Clone, PartialEq, Eq)]
pub struct RepetitionStats {
    pub total: usize,
    pub due: usize,
    pub mature: usize,
    pub young: usize,
    pub new_cards: usize,
}

#[derive(Default)]
pub struct SpacedRepetitionEngine {
    cards: Vec<Flashcard>,
    persist_path: Option<PathBuf>,
}

impl SpacedRepetitionEngine {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_cards(cards: Vec<Flashcard>) -> Self {
        Self {
            cards,
            persist_path: None,
        }
    }

    pub fn load(path: PathBuf) -> Self {
        let cards: Vec<Flashcard> = read_json_or_default(&path);
        Self {
            cards,
            persist_path: Some(path),
        }
    }

    pub fn reload(&mut self) {
        if let Some(path) = &self.persist_path {
            self.cards = read_json_or_default(path);
        }
    }

    fn persist(&self) -> Result<(), String> {
        match &self.persist_path {
            Some(path) => write_json(path, &self.cards),
            None => Ok(()),
        }
    }

    pub fn cards(&self) -> &[Flashcard] {
        &self.cards
    }

    pub fn get(&self, id: &str) -> Option<&Flashcard> {
        self.cards.iter().find(|card| card.id == id)
    }

    pub fn add_cards(&mut self, cards: Vec<Flashcard>) -> Result<(), String> {
        if cards.is_empty() {
            return Ok(());
        }
        self.cards.extend(cards);
        self.persist()
    }

    pub fn upsert(&mut self, card: Flashcard) -> Result<(), String> {
        match self
            .cards
            .iter_mut()
            .find(|existing| existing.id == card.id)
        {
            Some(existing) => *existing = card,
            None => self.cards.push(card),
        }
        self.persist()
    }

    pub fn update_content(
        &mut self,
        id: &str,
        front: String,
        back: String,
        collection_id: Option<Option<String>>,
    ) -> Result<Flashcard, String> {
        let card = self
            .cards
            .iter_mut()
            .find(|card| card.id == id)
            .ok_or_else(|| "Flashcard not found".to_string())?;
        card.front = front;
        card.back = back;
        if let Some(collection) = collection_id {
            card.collection_id = collection;
        }
        let updated = card.clone();
        self.persist()?;
        Ok(updated)
    }

    pub fn review(
        &mut self,
        id: &str,
        quality: ReviewQuality,
        now: DateTime<Utc>,
    ) -> Result<Flashcard, String> {
        let card = self
            .cards
            .iter_mut()
            .find(|card| card.id == id)
            .ok_or_else(|| "Flashcard not found".to_string())?;
        card.review_at(quality, now);
        let updated = card.clone();
        self.persist()?;
        Ok(updated)
    }

    pub fn remove(&mut self, id: &str) -> Result<bool, String> {
        let before = self.cards.len();
        self.cards.retain(|card| card.id != id);
        let removed = self.cards.len() < before;
        if removed {
            self.persist()?;
        }
        Ok(removed)
    }

    pub fn remove_collection(&mut self, collection_id: &str) -> Result<usize, String> {
        let before = self.cards.len();
        self.cards
            .retain(|card| card.collection_id.as_deref() != Some(collection_id));
        let removed = before - self.cards.len();
        if removed > 0 {
            self.persist()?;
        }
        Ok(removed)
    }

    pub fn reset(
        &mut self,
        collection_id: Option<&str>,
        period_days: Option<f64>,
        now: DateTime<Utc>,
    ) -> Result<usize, String> {
        let offset_seconds = period_days
            .filter(|days| days.is_finite() && *days > 0.0)
            .map(|days| (days.min(MAX_INTERVAL_DAYS as f64) * 86_400.0) as i64)
            .unwrap_or(0);
        let due = after_delay(now, Duration::seconds(offset_seconds));
        let mut count = 0;
        for card in self
            .cards
            .iter_mut()
            .filter(|card| collection_id.is_none_or(|id| card.collection_id.as_deref() == Some(id)))
        {
            card.reset(due);
            count += 1;
        }
        if count > 0 {
            self.persist()?;
        }
        Ok(count)
    }

    pub fn apply_legacy_qualities(
        &mut self,
        qualities: HashMap<String, ReviewQuality>,
    ) -> Result<usize, String> {
        let mut applied = 0;
        for card in self.cards.iter_mut() {
            if card.last_quality.is_none() {
                if let Some(quality) = qualities.get(&card.id) {
                    card.last_quality = Some(*quality);
                    applied += 1;
                }
            }
        }
        if applied > 0 {
            self.persist()?;
        }
        Ok(applied)
    }

    pub fn due_count(&self, now: DateTime<Utc>) -> usize {
        self.cards.iter().filter(|card| card.is_due_at(now)).count()
    }

    pub fn stats(&self, now: DateTime<Utc>) -> RepetitionStats {
        let mut stats = RepetitionStats {
            total: self.cards.len(),
            ..Default::default()
        };
        for card in &self.cards {
            if card.is_due_at(now) {
                stats.due += 1;
            }
            if card.is_new() {
                stats.new_cards += 1;
            } else if card.interval_days >= MATURE_INTERVAL_DAYS {
                stats.mature += 1;
            } else {
                stats.young += 1;
            }
        }
        stats
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn card() -> Flashcard {
        Flashcard::new("Q".into(), "A".into(), None, None)
    }

    #[test]
    fn good_reviews_follow_sm2_intervals() {
        let now = Utc::now();
        let mut c = card();
        c.review_at(ReviewQuality::Good, now);
        assert_eq!(c.interval_days, 1);
        c.review_at(ReviewQuality::Good, now);
        assert_eq!(c.interval_days, 6);
        c.review_at(ReviewQuality::Good, now);
        assert_eq!(c.interval_days, 15);
        assert!((c.ease_factor - DEFAULT_EASE).abs() < f64::EPSILON);
        assert!(!c.is_due_at(now));
    }

    #[test]
    fn again_resets_and_lowers_ease() {
        let now = Utc::now();
        let mut c = card();
        c.review_at(ReviewQuality::Good, now);
        c.review_at(ReviewQuality::Good, now);
        c.review_at(ReviewQuality::Again, now);
        assert_eq!(c.repetitions, 0);
        assert_eq!(c.interval_days, 0);
        assert_eq!(c.lapses, 1);
        assert!(c.ease_factor < DEFAULT_EASE);
        assert!(c.is_due_at(now + Duration::minutes(11)));
        assert!(!c.is_new());
    }

    #[test]
    fn ease_never_drops_below_minimum() {
        let now = Utc::now();
        let mut c = card();
        for _ in 0..20 {
            c.review_at(ReviewQuality::Again, now);
        }
        assert!((c.ease_factor - MIN_EASE).abs() < f64::EPSILON);
    }

    #[test]
    fn easy_grows_faster_than_good_and_hard_slower() {
        let now = Utc::now();
        let mut base = card();
        base.review_at(ReviewQuality::Good, now);
        base.review_at(ReviewQuality::Good, now);
        let mut hard = base.clone();
        let mut good = base.clone();
        let mut easy = base.clone();
        hard.review_at(ReviewQuality::Hard, now);
        good.review_at(ReviewQuality::Good, now);
        easy.review_at(ReviewQuality::Easy, now);
        assert!(hard.interval_days < good.interval_days);
        assert!(good.interval_days < easy.interval_days);
    }

    #[test]
    fn stats_classify_cards() {
        let now = Utc::now();
        let mut engine = SpacedRepetitionEngine::with_cards(vec![card(), card(), card()]);
        let ids: Vec<String> = engine.cards().iter().map(|c| c.id.clone()).collect();
        engine.review(&ids[0], ReviewQuality::Good, now).unwrap();
        let mut mature = engine.get(&ids[1]).unwrap().clone();
        mature.interval_days = 30;
        mature.repetitions = 5;
        mature.last_reviewed = Some(now.to_rfc3339());
        mature.next_review = (now + Duration::days(30)).to_rfc3339();
        engine.upsert(mature).unwrap();
        let stats = engine.stats(now + Duration::seconds(1));
        assert_eq!(
            stats,
            RepetitionStats {
                total: 3,
                due: 1,
                mature: 1,
                young: 1,
                new_cards: 1
            }
        );
    }

    #[test]
    fn reset_is_scoped_to_collection() {
        let now = Utc::now();
        let mut a = card();
        a.collection_id = Some("a".into());
        let mut b = card();
        b.collection_id = Some("b".into());
        let mut engine = SpacedRepetitionEngine::with_cards(vec![a, b]);
        let ids: Vec<String> = engine.cards().iter().map(|c| c.id.clone()).collect();
        engine.review(&ids[0], ReviewQuality::Easy, now).unwrap();
        engine.review(&ids[1], ReviewQuality::Easy, now).unwrap();
        assert_eq!(engine.reset(Some("a"), None, now).unwrap(), 1);
        assert!(engine.get(&ids[0]).unwrap().is_new());
        assert!(!engine.get(&ids[1]).unwrap().is_new());
    }

    #[test]
    fn deserializes_legacy_cards() {
        let json = r#"[{"id":"1","front":"f","back":"b","source_file":null,"source_context":null,"ease_factor":2.6,"interval_days":6,"repetitions":2,"next_review":"2024-01-01T00:00:00+00:00","created_at":"2024-01-01T00:00:00+00:00","last_reviewed":null,"collectionId":"c"}]"#;
        let cards: Vec<Flashcard> = serde_json::from_str(json).unwrap();
        assert_eq!(cards[0].lapses, 0);
        assert_eq!(cards[0].collection_id.as_deref(), Some("c"));
        assert!(cards[0].last_quality.is_none());
    }

    #[test]
    fn survives_extreme_imported_values() {
        let now = Utc::now();
        let mut c = card();
        c.repetitions = 1;
        c.interval_days = i32::MAX;
        c.ease_factor = f64::MAX;
        c.review_at(ReviewQuality::Good, now);
        assert_eq!(c.interval_days, MAX_INTERVAL_DAYS);
        c.review_at(ReviewQuality::Easy, now);
        assert!(c.interval_days <= MAX_INTERVAL_DAYS);
        assert!(c.ease_factor <= MAX_EASE);
        let mut engine = SpacedRepetitionEngine::with_cards(vec![card()]);
        assert_eq!(engine.reset(None, Some(1e12), now).unwrap(), 1);
    }

    #[test]
    fn removes_collection_cards_only() {
        let mut a = card();
        a.collection_id = Some("a".into());
        let mut engine = SpacedRepetitionEngine::with_cards(vec![a, card()]);
        assert_eq!(engine.remove_collection("a").unwrap(), 1);
        assert_eq!(engine.cards().len(), 1);
    }
}
