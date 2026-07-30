import { invoke } from '@tauri-apps/api/core';

// ── Types ───────────────────────────────────────────────────────────

export type FileType = 'Pdf' | 'Markdown' | 'StickyNote' | 'Image' | 'Unknown';

export interface StudyFile {
  id: string;
  name: string;
  path: string;
  file_type: FileType;
  created_at: string;
  lastOpened?: string;
  x: number;
  y: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type TaskType =
  | 'Explain'
  | 'GenerateFlashcard'
  | 'Summarize'
  | 'Quiz'
  | 'Translate'
  | 'CodeExplain'
  | 'Custom';

export interface AIResponse {
  content: string;
  provider: string;
  model: string;
  tokens_used?: number;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  source_file?: string;
  source_context?: string;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  next_review: string;
  created_at: string;
  last_reviewed?: string;
  collectionId?: string;
}

export type ReviewQuality = 'Again' | 'Hard' | 'Good' | 'Easy';

export interface RepetitionStats {
  total: number;
  due: number;
  mature: number;
  young: number;
  new_cards: number;
}

export interface DocumentChunk {
  id: string;
  content: string;
  source_file: string;
  page_number?: number;
}

// ── File System ─────────────────────────────────────────────────────

export async function getWorkspaceFiles(directory?: string): Promise<StudyFile[]> {
  return invoke('get_workspace_files', { directory });
}

export async function getAllFiles(): Promise<StudyFile[]> {
  return invoke('get_all_files');
}

export async function saveFile(name: string, content: string, directory?: string): Promise<string> {
  return invoke('save_file', { name, content, directory });
}

export async function readFile(relativePath: string): Promise<string> {
  return invoke('read_file', { relativePath });
}

export async function deleteFile(relativePath: string): Promise<void> {
  return invoke('delete_file', { relativePath });
}

export async function saveNote(name: string, content: string): Promise<string> {
  return invoke('save_note', { name, content });
}

export async function readNote(name: string): Promise<string> {
  return invoke('read_note', { name });
}

// ── AI ──────────────────────────────────────────────────────────────

export async function aiChat(
  messages: ChatMessage[],
  taskType: TaskType,
  context?: string
): Promise<AIResponse> {
  return invoke('ai_chat', { messages, taskType, context });
}

export async function aiExplain(content: string, subject?: string): Promise<AIResponse> {
  return invoke('ai_explain', { content, subject });
}

export async function generateFlashcard(
  content: string,
  sourceFile?: string,
  collectionId?: string
): Promise<Flashcard[]> {
  return invoke('generate_flashcard', { content, sourceFile, collectionId });
}

export async function addAIProvider(
  providerType: string,
  apiKey?: string,
  endpoint?: string,
  model?: string
): Promise<void> {
  const args: Record<string, unknown> = { providerType };
  if (apiKey) args.apiKey = apiKey;
  if (endpoint) args.endpoint = endpoint;
  if (model) args.model = model;
  return invoke('add_ai_provider', args);
}

export async function testAIProvider(): Promise<AIResponse> {
  return invoke('test_ai_provider');
}

// ── Spaced Repetition ───────────────────────────────────────────────

export async function getDueCards(): Promise<Flashcard[]> {
  return invoke('get_due_cards');
}

export async function getAllFlashcards(): Promise<Flashcard[]> {
  return invoke('get_all_flashcards');
}

export async function reviewFlashcard(cardId: string, quality: ReviewQuality): Promise<Flashcard> {
  return invoke('review_flashcard', { cardId, quality });
}

export async function deleteFlashcard(cardId: string): Promise<void> {
  return invoke('delete_flashcard', { cardId });
}

export async function deleteFlashcardsByCollection(collectionId: string): Promise<number> {
  return invoke('delete_flashcards_by_collection', { collectionId });
}

export async function getFlashcardStats(): Promise<RepetitionStats> {
  return invoke('get_flashcard_stats');
}

// ── Vector DB ───────────────────────────────────────────────────────

export async function indexDocument(content: string, sourceFile: string): Promise<number> {
  return invoke('index_document', { content, sourceFile });
}

export async function searchDocuments(query: string, limit?: number): Promise<DocumentChunk[]> {
  return invoke('search_documents', { query, limit });
}

export async function getIndexStats(): Promise<number> {
  return invoke('get_index_stats');
}

// ── Analytics ───────────────────────────────────────────────────────

export interface StudyActivity {
  id: string;
  activity_type: string;
  label: string;
  duration_seconds: number;
  metadata?: string;
  timestamp: string;
}

export interface ExamResult {
  id: string;
  subject: string;
  title: string;
  score: number;
  total: number;
  percentage: number;
  date: string;
  notes?: string;
}

export interface StudyStats {
  total_study_minutes: number;
  pomodoro_sessions: number;
  flashcards_reviewed: number;
  documents_read: number;
  exams_taken: number;
}

export async function logStudyActivity(activity: StudyActivity): Promise<void> {
  return invoke('log_study_activity', { activity });
}

export async function getStudyStats(): Promise<StudyStats> {
  return invoke('get_study_stats');
}

export async function getTodayStudyMinutes(): Promise<number> {
  return invoke('get_today_study_minutes');
}

export async function saveExamResult(exam: ExamResult): Promise<void> {
  return invoke('save_exam_result', { exam });
}

export async function getExamResults(): Promise<ExamResult[]> {
  return invoke('get_exam_results');
}

// ── New Persistence Commands ─────────────────────────────────────────

export async function saveFlashcard(card: Flashcard): Promise<void> {
  return invoke('save_flashcard', { card });
}

export async function saveExamData(examData: Record<string, unknown>): Promise<void> {
  return invoke('save_exam_data', { examData });
}

export async function loadExamsData(): Promise<Record<string, unknown>[]> {
  return invoke('load_exams_data');
}

export async function deleteExamData(examId: string): Promise<void> {
  return invoke('delete_exam_data', { examId });
}

export async function logRecentDocument(doc: StudyFile): Promise<void> {
  return invoke('log_recent_document', { doc });
}

export async function getRecentDocuments(): Promise<StudyFile[]> {
  return invoke('get_recent_documents');
}

export async function deleteWorkspaceFile(relativePath: string): Promise<void> {
  return invoke('delete_workspace_file', { relativePath });
}

export async function getAIProviders(): Promise<{ type: string; model: string; configured: boolean; active: boolean; endpoint?: string }[]> {
  return invoke('get_ai_providers');
}

export async function removeAIProvider(providerType: string): Promise<void> {
  return invoke('remove_ai_provider', { providerType });
}

export async function setDefaultAIProvider(providerType: string): Promise<void> {
  return invoke('set_default_ai_provider', { providerType });
}

export async function checkOllama(): Promise<{ available: boolean }> {
  return invoke('check_ollama');
}

export interface CollectionEntry {
  id: string;
  name: string;
  description: string;
  created_at: string;
  review_period_days: number;
}

export async function saveCollections(collections: CollectionEntry[]): Promise<void> {
  return invoke('save_collections', { collections });
}

export async function restoreAllFlashcards(periodDays?: number): Promise<void> {
  return invoke('restore_all_flashcards', { periodDays });
}

export async function getCardsByFilter(
  due: boolean, newCards: boolean, young: boolean, mature: boolean
): Promise<Flashcard[]> {
  return invoke('get_cards_by_filter', { due, newCards, young, mature });
}

export async function checkDueFlashcards(): Promise<number> {
  return invoke('check_due_flashcards');
}

// ── Notifications (Web API) ──────────────────────────────────────────

export async function sendStudyNotification(title: string, body: string) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico' });
  } else if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico' });
    }
  }
}

export function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

export async function loadCollections(): Promise<CollectionEntry[]> {
  return invoke('load_collections');
}

// ── Chat Sessions ────────────────────────────────────────────────────────

export async function saveChatSessions(sessions: Record<string, unknown>[]): Promise<void> {
  return invoke('save_chat_sessions', { sessions });
}

export async function loadChatSessions(): Promise<Record<string, unknown>[]> {
  return invoke('load_chat_sessions');
}

export async function saveMotivationSessions(sessions: Record<string, unknown>[]): Promise<void> {
  return invoke('save_motivation_sessions', { sessions });
}

export async function loadMotivationSessions(): Promise<Record<string, unknown>[]> {
  return invoke('load_motivation_sessions');
}

// ── Canvas ──────────────────────────────────────────────────────────────

export async function saveFileBinary(name: string, base64Content: string, directory: string): Promise<string> {
  return invoke('save_file_binary', { name, base64Content, directory });
}

export async function readFileBase64(relativePath: string): Promise<string> {
  return invoke('read_file_base64', { relativePath });
}

export async function saveCanvasState(json: string): Promise<void> {
  return invoke('save_canvas_state', { json });
}

export async function loadCanvasState(): Promise<string> {
  return invoke('load_canvas_state');
}
