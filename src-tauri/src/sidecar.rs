//! Lifecycle of the bundled `typelab-api` sidecar.
//!
//! Protocol (stdout of the sidecar): zero or more log lines, then either
//! `ELF_SIDECAR_PORT=<port>` or `ELF_SIDECAR_ERROR=<reason>` followed by exit
//! code 1. The sidecar exits by itself once its stdin closes, so it cannot
//! outlive the shell even if `stop` never runs.
//!
//! Everything that can be decided without an `AppHandle` lives in pure
//! functions on [`BackendState`]; `spawn` is the only layer of Tauri glue.

use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Cold start measured at 8.6 s on a Windows CI runner, so 15 s leaves margin.
pub const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(15);
/// How long `stop` waits for `Terminated` after killing the child.
pub const STOP_TIMEOUT: Duration = Duration::from_secs(5);
const POLL_INTERVAL: Duration = Duration::from_millis(50);
const STDERR_TAIL_LINES: usize = 50;
const PORT_PREFIX: &str = "ELF_SIDECAR_PORT=";
const ERROR_PREFIX: &str = "ELF_SIDECAR_ERROR=";

/// One line of the sidecar's startup handshake.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Handshake {
    Port(u16),
    Error(String),
}

/// Returns `None` for ordinary log lines and for a malformed handshake.
pub fn parse_handshake(line: &str) -> Option<Handshake> {
    let line = line.trim();
    if let Some(port) = line.strip_prefix(PORT_PREFIX) {
        return match port.trim().parse::<u16>() {
            Ok(port) if port != 0 => Some(Handshake::Port(port)),
            _ => None,
        };
    }
    line.strip_prefix(ERROR_PREFIX)
        .map(|reason| Handshake::Error(reason.trim().to_string()))
}

/// Reassembles lines from output chunks that may split a line anywhere.
#[derive(Default)]
pub struct LineBuffer {
    pending: Vec<u8>,
}

impl LineBuffer {
    /// Feeds a chunk and returns every line it completed, without `\r`/`\n`.
    pub fn push(&mut self, chunk: &[u8]) -> Vec<String> {
        self.pending.extend_from_slice(chunk);
        let mut lines = Vec::new();
        while let Some(end) = self.pending.iter().position(|b| *b == b'\n') {
            let rest = self.pending.split_off(end + 1);
            let raw = std::mem::replace(&mut self.pending, rest);
            lines.push(decode_line(&raw));
        }
        lines
    }

    /// Returns the unterminated tail, if any (used when the process ends).
    pub fn finish(&mut self) -> Option<String> {
        if self.pending.is_empty() {
            return None;
        }
        let raw = std::mem::take(&mut self.pending);
        Some(decode_line(&raw))
    }
}

fn decode_line(raw: &[u8]) -> String {
    String::from_utf8_lossy(raw)
        .trim_end_matches(['\r', '\n'])
        .to_string()
}

/// What the event loop should do after the sidecar process ended.
#[derive(Debug, PartialEq, Eq)]
pub enum TerminatedAction {
    /// The shell asked for the stop, so there is nothing to recover.
    Ignore,
    /// First unexpected exit: start it once more.
    Restart,
    /// Second unexpected exit: `error` now holds the reason.
    Failed,
}

#[derive(Default)]
pub struct BackendState {
    port: Mutex<Option<u16>>,
    error: Mutex<Option<String>>,
    child: Mutex<Option<CommandChild>>,
    stopping: AtomicBool,
    restarts: AtomicU8,
    terminated: AtomicBool,
    stderr_tail: Mutex<VecDeque<String>>,
}

impl BackendState {
    fn record_handshake(&self, handshake: Handshake) {
        match handshake {
            Handshake::Port(port) => *self.port.lock().unwrap() = Some(port),
            Handshake::Error(reason) => *self.error.lock().unwrap() = Some(reason),
        }
    }

    fn record_stderr(&self, line: String) {
        let mut tail = self.stderr_tail.lock().unwrap();
        if tail.len() == STDERR_TAIL_LINES {
            tail.pop_front();
        }
        tail.push_back(line);
    }

    fn last_stderr(&self) -> Option<String> {
        self.stderr_tail
            .lock()
            .unwrap()
            .iter()
            .rev()
            .find(|l| !l.trim().is_empty())
            .cloned()
    }

    /// Clears what a previous process left behind, before (re)spawning.
    fn reset_for_spawn(&self) {
        *self.port.lock().unwrap() = None;
        *self.error.lock().unwrap() = None;
        self.terminated.store(false, Ordering::SeqCst);
    }

    /// Decides what follows the end of the process and updates the state.
    fn on_terminated(&self, code: Option<i32>) -> TerminatedAction {
        self.terminated.store(true, Ordering::SeqCst);
        if self.stopping.load(Ordering::SeqCst) {
            return TerminatedAction::Ignore;
        }
        // The process is gone; drop its handle and the port it announced.
        *self.child.lock().unwrap() = None;
        *self.port.lock().unwrap() = None;

        if self
            .restarts
            .compare_exchange(0, 1, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
        {
            return TerminatedAction::Restart;
        }

        let mut error = self.error.lock().unwrap();
        if error.is_none() {
            let code = code.map_or("unknown".to_string(), |c| c.to_string());
            *error = Some(match self.last_stderr() {
                Some(line) => format!("backend exited unexpectedly (code {code}): {line}"),
                None => format!("backend exited unexpectedly (code {code})"),
            });
        }
        TerminatedAction::Failed
    }
}

/// Blocks until the sidecar reported its port, reported an error, or `timeout`.
pub fn wait_for_handshake(state: &BackendState, timeout: Duration) -> Result<u16, String> {
    let start = Instant::now();
    loop {
        if let Some(port) = *state.port.lock().unwrap() {
            return Ok(port);
        }
        if let Some(error) = state.error.lock().unwrap().clone() {
            return Err(error);
        }
        if start.elapsed() >= timeout {
            return Err(format!(
                "timed out (逾時) after {} s waiting for the backend to start",
                timeout.as_secs()
            ));
        }
        std::thread::sleep(POLL_INTERVAL);
    }
}

/// Stops the sidecar. Having no child is not an error.
pub fn stop(state: &BackendState) -> Result<(), String> {
    stop_with_timeout(state, STOP_TIMEOUT)
}

fn stop_with_timeout(state: &BackendState, timeout: Duration) -> Result<(), String> {
    state.stopping.store(true, Ordering::SeqCst);
    let Some(child) = state.child.lock().unwrap().take() else {
        return Ok(());
    };
    child
        .kill()
        .map_err(|e| format!("cannot stop the backend: {e}"))?;

    let start = Instant::now();
    while !state.terminated.load(Ordering::SeqCst) {
        if start.elapsed() >= timeout {
            return Err(format!(
                "the backend did not exit within {} s",
                timeout.as_secs()
            ));
        }
        std::thread::sleep(POLL_INTERVAL);
    }
    *state.port.lock().unwrap() = None;
    Ok(())
}

/// Starts the sidecar and the task that reads its output. On failure the
/// reason is also stored in the state so `api_base_url` can report it.
pub fn spawn(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<BackendState>();
    state.reset_for_spawn();
    spawn_inner(app, &state).inspect_err(|reason| {
        *state.error.lock().unwrap() = Some(reason.clone());
    })
}

fn spawn_inner(app: &AppHandle, state: &BackendState) -> Result<(), String> {
    let model_dir = crate::resolve_model_dir(app)?;
    let db_path: PathBuf = crate::local_data_dir(app)?.join("typelab.db");

    // Raw output: chunks arrive unsplit, so `LineBuffer` alone decides where a
    // line ends instead of depending on how the plugin splits `\r` and `\n`.
    let (mut rx, child) = app
        .shell()
        .sidecar("typelab-api")
        .map_err(|e| format!("cannot find the backend binary: {e}"))?
        .set_raw_out(true)
        .env("ELF_SIDECAR", "1")
        .env("TYPELAB_DB_PATH", &db_path)
        .env("TYPELAB_MODEL_DIR", &model_dir)
        .spawn()
        .map_err(|e| format!("cannot start the backend: {e}"))?;
    *state.child.lock().unwrap() = Some(child);

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<BackendState>();
        let mut stdout = LineBuffer::default();
        let mut stderr = LineBuffer::default();
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(chunk) => {
                    for line in stdout.push(&chunk) {
                        if let Some(handshake) = parse_handshake(&line) {
                            state.record_handshake(handshake);
                        }
                    }
                }
                CommandEvent::Stderr(chunk) => {
                    for line in stderr.push(&chunk) {
                        state.record_stderr(line);
                    }
                }
                CommandEvent::Terminated(payload) => {
                    if let Some(handshake) = stdout.finish().as_deref().and_then(parse_handshake) {
                        state.record_handshake(handshake);
                    }
                    if let Some(line) = stderr.finish() {
                        state.record_stderr(line);
                    }
                    if state.on_terminated(payload.code) == TerminatedAction::Restart {
                        state.reset_for_spawn();
                        if let Err(reason) = spawn_inner(&app, &state) {
                            *state.error.lock().unwrap() = Some(reason);
                        }
                    }
                    break;
                }
                _ => {}
            }
        }
    });
    Ok(())
}

/// Waits for the handshake off the async runtime's worker threads.
pub async fn api_base_url(app: AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<BackendState>();
        wait_for_handshake(&state, HANDSHAKE_TIMEOUT)
            .map(|port| format!("http://127.0.0.1:{port}/api"))
    })
    .await
    .map_err(|e| format!("backend wait task failed: {e}"))?
}

/// Stops the sidecar off the async runtime's worker threads.
pub async fn stop_backend(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || stop(&app.state::<BackendState>()))
        .await
        .map_err(|e| format!("backend stop task failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_port_line() {
        assert_eq!(
            parse_handshake("ELF_SIDECAR_PORT=5123"),
            Some(Handshake::Port(5123))
        );
    }

    #[test]
    fn parses_error_line() {
        assert_eq!(
            parse_handshake("ELF_SIDECAR_ERROR=database is locked"),
            Some(Handshake::Error("database is locked".to_string()))
        );
    }

    #[test]
    fn ignores_log_lines_before_handshake() {
        assert_eq!(parse_handshake("info: Microsoft.Hosting.Lifetime[0]"), None);
    }

    #[test]
    fn rejects_bad_port() {
        assert_eq!(parse_handshake("ELF_SIDECAR_PORT=abc"), None);
        assert_eq!(parse_handshake("ELF_SIDECAR_PORT=70000"), None);
    }

    #[test]
    fn trims_crlf() {
        assert_eq!(
            parse_handshake("ELF_SIDECAR_PORT=5123\r"),
            Some(Handshake::Port(5123))
        );
    }

    #[test]
    fn stop_without_child_is_ok() {
        let state = BackendState::default();
        assert_eq!(stop(&state), Ok(()));
    }

    #[test]
    fn line_buffer_joins_partial_chunks_and_strips_crlf() {
        let mut buf = LineBuffer::default();
        assert!(buf.push(b"ELF_SIDECAR_PO").is_empty());
        assert_eq!(buf.push(b"RT=5123\r\nnext"), vec!["ELF_SIDECAR_PORT=5123"]);
        assert_eq!(buf.push(b" line\n"), vec!["next line"]);
        assert_eq!(buf.finish(), None);
    }

    #[test]
    fn line_buffer_emits_several_lines_from_one_chunk() {
        let mut buf = LineBuffer::default();
        assert_eq!(buf.push(b"a\r\nb\n\nc"), vec!["a", "b", ""]);
        assert_eq!(buf.finish(), Some("c".to_string()));
    }

    #[test]
    fn wait_returns_the_announced_port() {
        let state = BackendState::default();
        state.record_handshake(Handshake::Port(5123));
        assert_eq!(
            wait_for_handshake(&state, Duration::from_millis(10)),
            Ok(5123)
        );
    }

    #[test]
    fn wait_returns_the_reported_error() {
        let state = BackendState::default();
        state.record_handshake(Handshake::Error("database is locked".to_string()));
        assert_eq!(
            wait_for_handshake(&state, Duration::from_millis(10)),
            Err("database is locked".to_string())
        );
    }

    #[test]
    fn wait_times_out_without_handshake() {
        let state = BackendState::default();
        let result = wait_for_handshake(&state, Duration::from_millis(120));
        assert!(result.unwrap_err().contains("timed out"));
    }

    #[test]
    fn wait_sees_a_port_that_arrives_later() {
        let state = std::sync::Arc::new(BackendState::default());
        let writer = state.clone();
        let handle = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(100));
            writer.record_handshake(Handshake::Port(6001));
        });
        assert_eq!(wait_for_handshake(&state, Duration::from_secs(5)), Ok(6001));
        handle.join().unwrap();
    }

    #[test]
    fn first_unexpected_exit_restarts_and_the_second_fails_with_stderr() {
        let state = BackendState::default();
        state.record_handshake(Handshake::Port(5123));
        assert_eq!(state.on_terminated(Some(1)), TerminatedAction::Restart);
        assert_eq!(*state.port.lock().unwrap(), None);

        state.reset_for_spawn();
        state.record_stderr("Unhandled exception: boom".to_string());
        state.record_stderr(String::new());
        assert_eq!(state.on_terminated(Some(134)), TerminatedAction::Failed);
        assert_eq!(
            wait_for_handshake(&state, Duration::from_millis(10)),
            Err("backend exited unexpectedly (code 134): Unhandled exception: boom".to_string())
        );
    }

    #[test]
    fn exit_after_handshake_error_keeps_the_reported_reason() {
        let state = BackendState::default();
        state.restarts.store(1, Ordering::SeqCst);
        state.record_handshake(Handshake::Error("database is locked".to_string()));
        assert_eq!(state.on_terminated(Some(1)), TerminatedAction::Failed);
        assert_eq!(
            wait_for_handshake(&state, Duration::from_millis(10)),
            Err("database is locked".to_string())
        );
    }

    #[test]
    fn exit_while_stopping_is_not_restarted() {
        let state = BackendState::default();
        state.stopping.store(true, Ordering::SeqCst);
        assert_eq!(state.on_terminated(Some(0)), TerminatedAction::Ignore);
        assert!(state.terminated.load(Ordering::SeqCst));
    }

    #[test]
    fn stderr_keeps_only_the_last_fifty_lines() {
        let state = BackendState::default();
        for i in 0..80 {
            state.record_stderr(format!("line {i}"));
        }
        let tail = state.stderr_tail.lock().unwrap();
        assert_eq!(tail.len(), 50);
        assert_eq!(tail.front().map(String::as_str), Some("line 30"));
    }
}
