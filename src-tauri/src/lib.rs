pub mod ai_json;
pub mod ai_router;
pub mod analytics;
pub mod commands;
pub mod filesystem;
pub mod paths;
pub mod spaced_repetition;
pub mod state;
pub mod storage;
pub mod text;

use commands::{ai, backup, data, files, flashcards};
use paths::Workspace;
use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = match AppState::initialize(Workspace::new(Workspace::default_root())) {
        Ok(state) => state,
        Err(err) => {
            eprintln!("Annotate Studio failed to start: {err}");
            std::process::exit(1);
        }
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            files::list_workspace_files,
            files::stat_workspace_file,
            files::read_text_file,
            files::read_note,
            files::write_text_file,
            files::create_note,
            files::rename_workspace_file,
            files::delete_workspace_file,
            files::read_file_bytes,
            files::write_file_bytes,
            files::import_files,
            data::get_data_dir,
            data::load_canvas_state,
            data::save_canvas_state,
            data::load_settings,
            data::save_settings,
            data::load_exams,
            data::save_exams,
            data::load_collections,
            data::save_collections,
            data::load_chat_sessions,
            data::save_chat_sessions,
            data::load_motivation_sessions,
            data::save_motivation_sessions,
            data::log_study_activity,
            data::get_study_stats,
            flashcards::get_flashcards,
            flashcards::get_flashcard_stats,
            flashcards::count_due_flashcards,
            flashcards::create_flashcard,
            flashcards::update_flashcard,
            flashcards::review_flashcard,
            flashcards::delete_flashcard,
            flashcards::delete_flashcards_by_collection,
            flashcards::reset_flashcards,
            ai::ai_chat,
            ai::generate_flashcards,
            ai::generate_flashcards_from_file,
            ai::cancel_generation,
            ai::get_ai_providers,
            ai::add_ai_provider,
            ai::remove_ai_provider,
            ai::set_default_ai_provider,
            ai::test_ai_provider,
            ai::check_ollama,
            backup::export_data,
            backup::import_data,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Annotate Studio");
}
