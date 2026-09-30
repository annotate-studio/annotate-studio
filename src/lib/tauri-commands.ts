import { invoke, type InvokeArgs } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export type FileType = 'Pdf' | 'Markdown' | 'Text' | 'Image' | 'Document' | 'Unknown';

export interface StudyFile {
  id: string;
  name: string;
  path: string;
  file_type: FileType;
  size: number;
  created_at: string;
  modified_at: string;
}

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessagePayload {
  role: ChatRole;
  content: string;
}

export interface AIResponse {
  content: string;
  provider: string;
  model: string;
  tokens_used?: number | null;
}

export interface ProviderInfo {
  id: string;
  type: string;
  model: string;
  endpoint?: string | null;
  active: boolean;
}

export type ReviewQuality = 'Again' | 'Hard' | 'Good' | 'Easy';

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  source_file?: string | null;
  source_context?: string | null;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  lapses?: number;
  next_review: string;
  created_at: string;
  last_reviewed?: string | null;
  last_quality?: ReviewQuality | null;
  collectionId?: string | null;
}

export interface RepetitionStats {
  total: number;
  due: number;
  mature: number;
  young: number;
  new_cards: number;
}

export interface StudyStats {
  total_study_minutes: number;
  today_study_minutes: number;
  pomodoro_sessions: number;
  today_pomodoro_sessions: number;
  flashcards_reviewed: number;
  today_flashcards_reviewed: number;
  exams_taken: number;
}

export interface CollectionEntry {
  id: string;
  name: string;
  description: string;
  created_at: string;
  review_period_days: number;
}

export interface GenerationProgress {
  request_id: string;
  current: number;
  total: number;
  preview: string;
  generated: number;
}

export type WriteTarget = { path: string } | { dir: string; name: string; unique?: boolean };

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message);
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

let exclusiveCommand: string | null = null;

export function reserveCommands(command: string | null): void {
  exclusiveCommand = command;
}

async function call<T>(command: string, args?: InvokeArgs): Promise<T> {
  if (!isTauri()) throw new Error('This feature needs the Annotate Studio desktop app.');
  if (exclusiveCommand !== null && command !== exclusiveCommand) {
    throw new Error('Annotate Studio is restoring a backup. Please wait a moment.');
  }
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw new Error(errorMessage(error));
  }
}

function toBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return Uint8Array.from(value as number[]);
  throw new Error('Unexpected binary response');
}

export const listWorkspaceFiles = () => call<StudyFile[]>('list_workspace_files');
export const statWorkspaceFile = (path: string) => call<StudyFile | null>('stat_workspace_file', { path });
export const readTextFile = (path: string) => call<string>('read_text_file', { path });

export interface NoteText {
  content: string;
  editable: boolean;
}

export const readNote = (path: string) => call<NoteText>('read_note', { path });
export const writeTextFile = (path: string, content: string) => call<StudyFile>('write_text_file', { path, content });
export const createNote = (name: string, content: string) => call<StudyFile>('create_note', { name, content });
export const renameWorkspaceFile = (path: string, newName: string) =>
  call<StudyFile>('rename_workspace_file', { path, newName });
export const deleteWorkspaceFile = (path: string) => call<void>('delete_workspace_file', { path });
export const importFiles = (paths: string[]) => call<StudyFile[]>('import_files', { paths });

export async function readFileBytes(path: string): Promise<Uint8Array> {
  return toBytes(await call<unknown>('read_file_bytes', { path }));
}

export async function writeFileBytes(target: WriteTarget, data: Uint8Array | ArrayBuffer): Promise<StudyFile> {
  const header = new TextEncoder().encode(JSON.stringify(target));
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const frame = new Uint8Array(4 + header.length + bytes.length);
  new DataView(frame.buffer).setUint32(0, header.length, true);
  frame.set(header, 4);
  frame.set(bytes, 4 + header.length);
  return call<StudyFile>('write_file_bytes', frame);
}

export const getDataDir = () => call<string>('get_data_dir');
export const loadCanvasState = () => call<unknown>('load_canvas_state');
export const saveCanvasState = (canvas: unknown) => call<void>('save_canvas_state', { canvas });
export const loadSettings = () => call<unknown>('load_settings');
export const saveSettings = (settings: unknown) => call<void>('save_settings', { settings });
export const loadExams = () => call<unknown[]>('load_exams');
export const saveExams = (exams: unknown[]) => call<void>('save_exams', { exams });
export const loadCollections = () => call<CollectionEntry[]>('load_collections');
export const saveCollections = (collections: CollectionEntry[]) => call<void>('save_collections', { collections });
export const loadChatSessions = () => call<unknown[]>('load_chat_sessions');
export const saveChatSessions = (sessions: unknown[]) => call<void>('save_chat_sessions', { sessions });
export const loadMotivationSessions = () => call<unknown[]>('load_motivation_sessions');
export const saveMotivationSessions = (sessions: unknown[]) => call<void>('save_motivation_sessions', { sessions });

export const logStudyActivity = (activityType: string, label: string, durationSeconds: number, metadata?: string) =>
  call<void>('log_study_activity', { activityType, label, durationSeconds: Math.max(0, Math.round(durationSeconds)), metadata });
export const getStudyStats = () => call<StudyStats>('get_study_stats');


export const getFlashcards = () => call<Flashcard[]>('get_flashcards');
export const getFlashcardStats = () => call<RepetitionStats>('get_flashcard_stats');
export const countDueFlashcards = () => call<number>('count_due_flashcards');
export const createFlashcard = (front: string, back: string, collectionId?: string | null, sourceFile?: string) =>
  call<Flashcard>('create_flashcard', { front, back, collectionId: collectionId ?? null, sourceFile });
export const updateFlashcard = (id: string, front: string, back: string, collectionId?: string | null) =>
  call<Flashcard>('update_flashcard', { id, front, back, collectionId: collectionId ?? null });
export const reviewFlashcard = (cardId: string, quality: ReviewQuality) => call<Flashcard>('review_flashcard', { cardId, quality });
export const deleteFlashcard = (cardId: string) => call<boolean>('delete_flashcard', { cardId });
export const deleteFlashcardsByCollection = (collectionId: string) =>
  call<number>('delete_flashcards_by_collection', { collectionId });
export const resetFlashcards = (collectionId?: string | null, periodDays?: number) =>
  call<number>('reset_flashcards', { collectionId: collectionId ?? null, periodDays });

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export const aiChat = (messages: ChatMessagePayload[], options: ChatOptions = {}) =>
  call<AIResponse>('ai_chat', {
    messages,
    model: options.model || null,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
  });

export interface GenerateOptions {
  collectionId?: string | null;
  model?: string;
  instructions?: string;
  requestId?: string;
}

export const generateFlashcards = (content: string, sourceFile: string | undefined, options: GenerateOptions = {}) =>
  call<Flashcard[]>('generate_flashcards', {
    content,
    sourceFile,
    collectionId: options.collectionId ?? null,
    model: options.model || null,
    instructions: options.instructions || null,
    requestId: options.requestId ?? null,
  });

export const generateFlashcardsFromFile = (path: string, options: GenerateOptions = {}) =>
  call<Flashcard[]>('generate_flashcards_from_file', {
    path,
    collectionId: options.collectionId ?? null,
    model: options.model || null,
    instructions: options.instructions || null,
    requestId: options.requestId ?? null,
  });

export const cancelGeneration = (requestId?: string) => call<void>('cancel_generation', { requestId: requestId ?? null });

export function onGenerationProgress(handler: (progress: GenerationProgress) => void): Promise<UnlistenFn> {
  if (!isTauri()) return Promise.resolve(() => {});
  return listen<GenerationProgress>('flashcard-generation-progress', (event) => handler(event.payload));
}

export const getAIProviders = () => call<ProviderInfo[]>('get_ai_providers');
export const addAIProvider = (providerType: string, apiKey?: string, endpoint?: string, model?: string, makeDefault?: boolean) =>
  call<ProviderInfo[]>('add_ai_provider', {
    providerType,
    apiKey: apiKey || null,
    endpoint: endpoint || null,
    model: model || null,
    makeDefault: makeDefault ?? false,
  });
export const removeAIProvider = (providerType: string, model?: string) =>
  call<ProviderInfo[]>('remove_ai_provider', { providerType, model: model ?? null });
export const setDefaultAIProvider = (providerType: string, model?: string) =>
  call<ProviderInfo[]>('set_default_ai_provider', { providerType, model: model ?? null });
export const testAIProvider = (model?: string) => call<AIResponse>('test_ai_provider', { model: model || null });
export const checkOllama = (endpoint?: string) => call<boolean>('check_ollama', { endpoint: endpoint || null });

export const exportData = (outputPath: string) => call<number>('export_data', { outputPath });
export const importData = (archivePath: string) => call<number>('import_data', { archivePath });
