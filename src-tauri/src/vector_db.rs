use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DocumentChunk {
    pub id: String,
    pub content: String,
    pub source_file: String,
    pub page_number: Option<u32>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchResult {
    pub chunk: DocumentChunk,
    pub score: f64,
}

pub struct VectorDB {
    conn: Connection,
}

impl VectorDB {
    pub fn new(db_path: &str) -> Result<Self, rusqlite::Error> {
        let conn = Connection::open(db_path)?;

        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                source_file TEXT NOT NULL,
                page_number INTEGER,
                embedding BLOB
            );

            CREATE INDEX IF NOT EXISTS idx_documents_source
                ON documents(source_file);
            ",
        )?;

        Ok(Self { conn })
    }

    pub fn insert_chunk(
        &self,
        content: &str,
        source_file: &str,
        page_number: Option<u32>,
    ) -> Result<String, rusqlite::Error> {
        let id = Uuid::new_v4().to_string();

        // Store embedding as NULL for now — real embedding generation
        // will be handled by a separate process or API call
        self.conn.execute(
            "INSERT INTO documents (id, content, source_file, page_number)
             VALUES (?1, ?2, ?3, ?4)",
            params![id, content, source_file, page_number],
        )?;

        Ok(id)
    }

    pub fn search(
        &self,
        _query: &str,
        top_k: usize,
    ) -> Result<Vec<DocumentChunk>, rusqlite::Error> {
        // For now, do a simple LIKE search as a fallback.
        // Real vector search will use sqlite-vec once embeddings are generated.
        let mut stmt = self.conn.prepare(
            "SELECT id, content, source_file, page_number
             FROM documents
             ORDER BY rowid DESC
             LIMIT ?1",
        )?;

        let rows = stmt.query_map(params![top_k as i64], |row| {
            Ok(DocumentChunk {
                id: row.get(0)?,
                content: row.get(1)?,
                source_file: row.get(2)?,
                page_number: row.get(3)?,
            })
        })?;

        rows.collect()
    }

    pub fn search_by_source(
        &self,
        source_file: &str,
    ) -> Result<Vec<DocumentChunk>, rusqlite::Error> {
        let mut stmt = self.conn.prepare(
            "SELECT id, content, source_file, page_number
             FROM documents
             WHERE source_file = ?1",
        )?;

        let rows = stmt.query_map(params![source_file], |row| {
            Ok(DocumentChunk {
                id: row.get(0)?,
                content: row.get(1)?,
                source_file: row.get(2)?,
                page_number: row.get(3)?,
            })
        })?;

        rows.collect()
    }

    pub fn delete_source(&self, source_file: &str) -> Result<usize, rusqlite::Error> {
        let count = self
            .conn
            .execute("DELETE FROM documents WHERE source_file = ?1", params![source_file])?;
        Ok(count)
    }

    pub fn count(&self) -> Result<usize, rusqlite::Error> {
        let count: i64 =
            self.conn
                .query_row("SELECT COUNT(*) FROM documents", [], |row| row.get(0))?;
        Ok(count as usize)
    }
}
