<div align="center">
  <img src="src-tauri/icons/128x128.png" alt="Annotate Studio logo" width="112" height="112">
  <h1>Annotate Studio</h1>
  <p>A local-first study workspace for the desktop: an infinite canvas for PDFs and notes, spaced-repetition flashcards, practice exams, a Pomodoro timer and an optional AI assistant.</p>
</div>

Everything runs on your machine. Documents, notes, canvas layouts, flashcards, exams and settings are plain files in one data folder, and the app works fully offline. AI features are opt-in and talk directly to the provider you configure (a local Ollama model or a cloud API).

Built with [Tauri 2](https://tauri.app) (Rust) and [Next.js 15](https://nextjs.org) / React 19.

## Features

### Canvas

- Infinite canvas with a dot grid, smooth zoom around the pointer (Ctrl + scroll or trackpad pinch) and panning by dragging the background, holding <kbd>Space</kbd>, the middle mouse button or two-finger scrolling.
- Windows for PDFs, Markdown notes and images that drag and resize precisely at any zoom level, come to the front when clicked, maximize to fill the view (double-click the title bar or press the maximize button, <kbd>Esc</kbd> restores) and minimize to a dock.
- Minimap, “fit all” (<kbd>Shift</kbd>+<kbd>1</kbd>), zoom to the selected window (<kbd>Shift</kbd>+<kbd>2</kbd>), one-click layouts (side by side, stacked, grid) and a lock to freeze the view.
- Undo and redo for layout changes (<kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>).
- Multiple workspaces, each with its own layout.
- Drop files from your file manager, paste an image or text, double-click the background for a quick note, or right-click for more actions. Importing the same file twice reuses the existing copy instead of duplicating it.

### PDF reader and annotation

- Rendering by PDFium (via EmbedPDF), shared by all PDF windows and running in a Web Worker when available, with sharp re-rendering while the canvas is zoomed.
- Tools: select, highlight text, pen, marker, text, rectangle, ellipse, arrow and eraser, with colors and stroke widths. Keyboard shortcuts: <kbd>V</kbd> <kbd>H</kbd> <kbd>P</kbd> <kbd>M</kbd> <kbd>T</kbd> <kbd>R</kbd> <kbd>O</kbd> <kbd>A</kbd> <kbd>E</kbd>.
- Annotations are saved back into the workspace copy of the PDF automatically, with their own undo history; “Export” saves an annotated copy anywhere.
- Selecting text shows a menu to copy, highlight, underline, ask the assistant, get a step-by-step explanation or turn the passage into flashcards.
- Links inside PDFs work: table-of-contents entries and references jump to their page, and web links open in your browser.
- Page navigation, zoom controls and fit-to-width.

### Notes

- Notes are real Markdown files in the `notes` folder, edited with CodeMirror: syntax highlighting, list continuation, search, formatting shortcuts (<kbd>Ctrl</kbd>+<kbd>B</kbd>/<kbd>I</kbd>/<kbd>E</kbd>/<kbd>K</kbd>) and autosave.
- Edit, split and preview modes. The preview renders headings, nested and task lists, tables with alignment, code blocks with a copy button, block quotes, images from the workspace and KaTeX math.
- `[[Wiki links]]` autocomplete from your library; clicking one opens the file on the canvas or offers to create the note.
- Right-to-left text such as Persian or Arabic is detected per line and paragraph, including lists and tables.
- Windows line endings are kept when a note is saved, and text files in other encodings open read-only so their characters are never damaged.

### Library

- Every PDF, note, image and document in the workspace, searchable, filterable by type and sortable by recent use, modification date, name or size.
- Open on the canvas, rename, delete, summarize, explain or make flashcards from any file.

### Flashcards

- Collections, manual cards with Markdown and math, and AI generation from pasted text or a document (PDF, Markdown, text, DOCX, ODT). Long documents are processed in parts with progress and a stop button.
- Anki-style SM-2 scheduling: “Again” relearns after ten minutes, “Hard” grows the interval slowly, “Good” keeps the ease, “Easy” grows faster. The next interval is shown on each button.
- Review sessions with a flip card and keyboard control (<kbd>Space</kbd> to flip, <kbd>1</kbd>–<kbd>4</kbd> to rate); failed cards come back at the end of the session.
- “Practice all” lets you go through cards that are not due yet without changing their schedule.

### Exams

- Write exams by hand or generate them with AI from a topic or one of your documents (number of questions, difficulty and time limit are adjustable).
- Timed attempts that keep running if you switch tabs, keyboard answering, optional instant feedback, and a results page with explanations and attempt history.
- Written answers can be graded by you or by the AI with feedback.

### Pomodoro

- Focus and break timers that keep running anywhere in the app (the remaining time is shown in the title bar), configurable durations, long-break interval and auto-start, synthesized sounds and desktop notifications, plus today’s focus statistics.

### AI assistant

- Chat panel docked under the canvas or floating, with saved conversations, a model picker and Markdown/KaTeX answers.
- Attach documents with `@name`; their text is included with your question. PDFs are read with PDFium, so no separate text extractor is needed.
- Summaries, step-by-step lessons with follow-up questions, and flashcards straight from the chat (“make 10 flashcards about …”).
- Requests can be stopped at any time, and Retry repeats exactly what failed (a summary stays a summary, with the same document).
- Providers: OpenAI, Anthropic, Google Gemini, Ollama, OpenRouter, Groq, DeepSeek, Mistral, Together, xAI, Perplexity and Cohere. Newer OpenAI models that reject `max_tokens` or custom temperatures are retried automatically.

### Motivation and settings

- A motivation corner with quotes, quick resets and a supportive study coach.
- Eight themes including a dark theme, any accent color, interface scaling, notifications, backup to a single `.anos` file and restore (a safety copy of the current data is made first).

## Keyboard shortcuts

| Shortcut | Action |
| :-- | :-- |
| <kbd>Ctrl</kbd>+<kbd>1</kbd>…<kbd>6</kbd>, <kbd>Ctrl</kbd>+<kbd>,</kbd> | Switch between Canvas, Library, Flashcards, Exams, Pomodoro, Motivation, Settings |
| <kbd>Ctrl</kbd>+<kbd>J</kbd> | Toggle the assistant |
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>N</kbd> | New note |
| <kbd>Ctrl</kbd>+<kbd>=</kbd> / <kbd>-</kbd> / <kbd>0</kbd> | Zoom in, out, reset (acts on the PDF when a PDF window is active) |
| <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> | Undo / redo |
| <kbd>Shift</kbd>+<kbd>1</kbd> / <kbd>Shift</kbd>+<kbd>2</kbd> | Fit all windows / zoom to the selected window |
| <kbd>Shift</kbd> while dragging | Snap windows to a 20 px grid |

The full list is under Settings → Shortcuts.

## Getting started

### Prerequisites

- Node.js 18 or newer and Yarn 1
- Rust (stable)
- The [Tauri 2 system dependencies](https://v2.tauri.app/start/prerequisites/) for your platform (on Linux: WebKitGTK 4.1, libsoup 3, GTK 3)
- With Nix: `nix develop` provides everything

### Run

```bash
yarn install
yarn tauri dev
```

### Build

```bash
yarn tauri build
```

Installers are written to `src-tauri/target/release/bundle/`.

### Checks

```bash
yarn typecheck                 # TypeScript
yarn test                      # parser and helper tests (Node 22+)
cd src-tauri && cargo test     # backend tests
```

## Where your data lives

All data is stored under your local data directory in `annotate-studio/` (for example `~/.local/share/annotate-studio` on Linux, `%LOCALAPPDATA%\annotate-studio` on Windows and `~/Library/Application Support/annotate-studio` on macOS):

| Path | Contents |
| :-- | :-- |
| `documents/` | Imported PDFs, images and documents (annotations are saved into these copies) |
| `notes/` | Markdown notes |
| `canvas/state.json` | Workspaces and window layouts |
| `settings.json` | Appearance, timer and assistant preferences |
| `flashcards.json`, `collections.json` | Cards with their schedules, and collections |
| `exams_data.json` | Exams and results |
| `chat_sessions.json`, `motivation_sessions.json` | Conversations |
| `providers.json` | AI provider configuration, including API keys (readable only by your user account on Linux and macOS) |
| `analytics/activities.jsonl` | Study activity log |
| `backups/` | Safety copies made before restoring a backup |

Files are written atomically, and a file that cannot be parsed is kept as `*.corrupt-<date>` instead of being overwritten. Data from earlier versions is migrated automatically.

## Project structure

```
src/
  app/                  Next.js entry, global styles and fonts
  components/
    app/                App-wide effects: loading, timers, notifications, shortcuts
    canvas/             Canvas viewport, windows, PDF, note and image views, minimap, dock
    chatbot/            Assistant panel, chat engine and lesson view
    markdown/           Markdown renderer and CodeMirror editor
    study/              Library, flashcards, exams, Pomodoro, motivation, settings
    layout/             Title bar and sidebar
    ui/                 Dialogs, toasts, menus, popovers, pickers
  lib/                  IPC bridge, Markdown parser, PDF engine, AI helpers, utilities
  store/                Zustand stores with debounced persistence
src-tauri/src/
  commands/             Tauri commands: files, data, flashcards, AI, backup
  ai_router.rs          Multi-provider AI client
  ai_json.rs            Robust parsing of AI output
  spaced_repetition.rs  Scheduling engine
  paths.rs, storage.rs  Workspace path safety and atomic storage
  text.rs               Text extraction and chunking
  filesystem.rs, analytics.rs, vector_db.rs, state.rs
```

## Credits

**Idea and feature design**: Taha Dostifam. The application was conceived for personal use, collecting the study tools needed in one place: flashcards with spaced repetition, exam practice, PDF annotation, a Pomodoro timer and optional AI assistance.

[License](./LICENSE)
