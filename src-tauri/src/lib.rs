use serde::Serialize;
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
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("no local data dir: {e}"))?
        .join("models");

    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;

    Ok(dir.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Every new command must be added here, or `invoke` fails at runtime.
        .invoke_handler(tauri::generate_handler![shell_info, model_dir])
        .run(tauri::generate_context!())
        .expect("error while running TypeLab");
}
