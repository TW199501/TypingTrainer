#[cfg(desktop)]
mod sidecar;

use serde::Serialize;
use std::path::PathBuf;

use tauri::Manager;

/// Reported by the web layer on the Settings page so a desktop build is
/// distinguishable from the browser build at runtime.
#[derive(Serialize)]
pub struct ShellInfo {
    pub version: String,
    pub platform: String,
}

#[tauri::command]
fn shell_info() -> ShellInfo {
    ShellInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        platform: std::env::consts::OS.to_string(),
    }
}

/// Where the desktop build keeps downloaded tokenizer/embedding/rerank models.
///
/// Resolved here rather than hard-coded in the web layer: the same Models page
/// also runs in a browser against the server, where the path is a container
/// volume instead. `app_local_data_dir` is deliberate — the *local* app data
/// directory, not the roaming one, because these files run to gigabytes and
/// must not be synced between machines.
///
///   Windows  %LOCALAPPDATA%\tw.elf.typelab\models
///   macOS    ~/Library/Application Support/tw.elf.typelab/models
///   Linux    ~/.local/share/tw.elf.typelab/models
#[tauri::command]
fn model_dir(app: tauri::AppHandle) -> Result<String, String> {
    Ok(resolve_model_dir(&app)?.to_string_lossy().into_owned())
}

/// The local (non-roaming) app data directory, shared by the models and the
/// sidecar's database.
#[cfg(desktop)]
pub(crate) fn local_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map_err(|e| format!("no local data dir: {e}"))
}

/// Resolves the models directory and creates it when missing.
pub(crate) fn resolve_model_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("no local data dir: {e}"))?
        .join("models");

    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;

    Ok(dir)
}

/// Base URL of the bundled API, including the `/api` prefix. Waits for the
/// sidecar's handshake, so the first call right after launch can take seconds.
#[tauri::command]
async fn api_base_url(app: tauri::AppHandle) -> Result<String, String> {
    #[cfg(desktop)]
    {
        sidecar::api_base_url(app).await
    }
    #[cfg(not(desktop))]
    {
        let _ = app;
        Err("the bundled API is only available on desktop".to_string())
    }
}

/// Stops the bundled API. Succeeds when there is nothing to stop.
#[tauri::command]
async fn stop_backend(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(desktop)]
    {
        sidecar::stop_backend(app).await
    }
    #[cfg(not(desktop))]
    {
        let _ = app;
        Ok(())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Every new command must be added here, or `invoke` fails at runtime.
        .invoke_handler(tauri::generate_handler![
            shell_info,
            model_dir,
            api_base_url,
            stop_backend
        ])
        .setup(|app| {
            // Registered at runtime rather than on the builder so the mobile
            // targets, which have no updater to register, still compile.
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
                app.handle().plugin(tauri_plugin_process::init())?;
                // Used from Rust only: capabilities grant no `shell:*`, so the
                // web layer cannot execute processes.
                app.handle().plugin(tauri_plugin_shell::init())?;
                app.manage(sidecar::BackendState::default());
                // A failure is kept in the state and surfaced by `api_base_url`,
                // so the window still opens and can show the reason.
                if let Err(reason) = sidecar::spawn(app.handle()) {
                    eprintln!("TypeLab backend failed to start: {reason}");
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building TypeLab")
        .run(|app, event| {
            #[cfg(desktop)]
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app.try_state::<sidecar::BackendState>() {
                    if let Err(reason) = sidecar::stop(&state) {
                        eprintln!("TypeLab backend did not stop cleanly: {reason}");
                    }
                }
            }
            #[cfg(not(desktop))]
            let _ = (app, event);
        });
}
