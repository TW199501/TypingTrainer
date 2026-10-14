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
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, Manager};
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

/// Tauri event emitted with the base URL after every successful handshake.
pub const EVENT_READY: &str = "backend://ready";
/// Tauri event emitted with the reason once the backend has finally failed.
pub const EVENT_FAILED: &str = "backend://failed";

/// What the web layer is told; the payload is always a plain string.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Announcement {
    Ready(String),
    Failed(String),
}

impl Announcement {
    pub fn event(&self) -> &'static str {
        match self {
            Announcement::Ready(_) => EVENT_READY,
            Announcement::Failed(_) => EVENT_FAILED,
        }
    }

    pub fn payload(&self) -> &str {
        match self {
            Announcement::Ready(payload) | Announcement::Failed(payload) => payload,
        }
    }
}

pub fn base_url(port: u16) -> String {
    format!("http://127.0.0.1:{port}/api")
}

/// Only a port handshake is announced; a handshake error is not final, since
/// the process may still be restarted.
pub fn announcement_for(handshake: &Handshake) -> Option<Announcement> {
    match handshake {
        Handshake::Port(port) => Some(Announcement::Ready(base_url(*port))),
        Handshake::Error(_) => None,
    }
}

/// Something that can be killed once; stands in for `CommandChild`.
pub trait Killable {
    fn kill(self) -> Result<(), String>;
}

impl Killable for CommandChild {
    fn kill(self) -> Result<(), String> {
        CommandChild::kill(self).map_err(|e| e.to_string())
    }
}

/// The child handle and everything that decides whether a child may exist.
///
/// `stopping`, the handle and the generation counters live behind one lock so
/// "stop" and "(re)start" cannot interleave: a start that sees `stopping` never
/// spawns, and a stop that returns has seen every child that will ever exist.
pub struct Lifecycle<C> {
    child: Option<(u64, C)>,
    stopping: bool,
    last_started: u64,
    last_terminated: u64,
}

impl<C> Default for Lifecycle<C> {
    fn default() -> Self {
        Self {
            child: None,
            stopping: false,
            last_started: 0,
            last_terminated: 0,
        }
    }
}

impl<C> Lifecycle<C> {
    /// Runs `spawn` (given the new generation) unless a stop was requested.
    /// `Ok(None)` means the start was refused and `spawn` was not called.
    pub fn start(
        &mut self,
        spawn: impl FnOnce(u64) -> Result<C, String>,
    ) -> Result<Option<u64>, String> {
        if self.stopping {
            return Ok(None);
        }
        let generation = self.last_started + 1;
        let child = spawn(generation)?;
        self.last_started = generation;
        self.child = Some((generation, child));
        Ok(Some(generation))
    }

    /// Records that generation `generation` ended. Returns whether a stop is
    /// in progress, in which case nobody should restart.
    pub fn ended(&mut self, generation: u64) -> bool {
        self.last_terminated = self.last_terminated.max(generation);
        if self.stopping {
            return true;
        }
        if matches!(self.child, Some((g, _)) if g == generation) {
            self.child = None;
        }
        false
    }

    /// Forbids any further start and hands out the current child, if any.
    pub fn begin_stop(&mut self) -> Option<(u64, C)> {
        self.stopping = true;
        self.child.take()
    }

    #[cfg(test)]
    pub fn has_child(&self) -> bool {
        self.child.is_some()
    }

    pub fn has_terminated(&self, generation: u64) -> bool {
        self.last_terminated >= generation
    }
}

/// Stops the child, then waits until that specific generation has ended.
pub fn stop_lifecycle<C: Killable>(
    life: &Mutex<Lifecycle<C>>,
    timeout: Duration,
) -> Result<(), String> {
    let Some((generation, child)) = life.lock().unwrap().begin_stop() else {
        return Ok(());
    };
    // A failed kill usually means the process is already gone; the wait below
    // still decides whether it really ended.
    let kill_error = child.kill().err();

    let start = Instant::now();
    while !life.lock().unwrap().has_terminated(generation) {
        if start.elapsed() >= timeout {
            return Err(match kill_error {
                Some(e) => format!("cannot stop the backend: {e}"),
                None => format!("the backend did not exit within {} s", timeout.as_secs()),
            });
        }
        std::thread::sleep(POLL_INTERVAL);
    }
    Ok(())
}

#[derive(Default)]
pub struct BackendState {
    port: Mutex<Option<u16>>,
    error: Mutex<Option<String>>,
    life: Mutex<Lifecycle<CommandChild>>,
    restarts: AtomicU8,
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
    }

    /// Decides what follows the end of generation `generation`.
    fn on_terminated(&self, generation: u64, code: Option<i32>) -> TerminatedAction {
        if self.life.lock().unwrap().ended(generation) {
            return TerminatedAction::Ignore;
        }
        // The process is gone; drop the port it announced.
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

    fn failure_announcement(&self) -> Announcement {
        Announcement::Failed(
            self.error
                .lock()
                .unwrap()
                .clone()
                .unwrap_or_else(|| "the backend failed".to_string()),
        )
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
    stop_lifecycle(&state.life, STOP_TIMEOUT)
}

fn emit(app: &AppHandle, announcement: &Announcement) {
    let _ = app.emit(announcement.event(), announcement.payload());
}

/// Starts the sidecar and the task that reads its output. On failure the
/// reason is also stored in the state so `api_base_url` can report it.
pub fn spawn(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<BackendState>();
    start_backend(app, &state).inspect_err(|reason| {
        *state.error.lock().unwrap() = Some(reason.clone());
    })
}

/// Spawns while holding the lifecycle lock, so a concurrent `stop` either
/// runs before (and the start is refused) or after (and kills this child).
fn start_backend(app: &AppHandle, state: &BackendState) -> Result<(), String> {
    state.reset_for_spawn();
    state
        .life
        .lock()
        .unwrap()
        .start(|generation| launch(app, generation))
        .map(|_| ())
}

fn launch(app: &AppHandle, generation: u64) -> Result<CommandChild, String> {
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

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<BackendState>();
        let mut stdout = LineBuffer::default();
        let mut stderr = LineBuffer::default();
        let handle_stdout_line = |line: String| {
            if let Some(handshake) = parse_handshake(&line) {
                let announcement = announcement_for(&handshake);
                state.record_handshake(handshake);
                if let Some(announcement) = announcement {
                    emit(&app, &announcement);
                }
            }
        };
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(chunk) => {
                    stdout
                        .push(&chunk)
                        .into_iter()
                        .for_each(&handle_stdout_line);
                }
                CommandEvent::Stderr(chunk) => {
                    for line in stderr.push(&chunk) {
                        state.record_stderr(line);
                    }
                }
                CommandEvent::Terminated(payload) => {
                    stdout.finish().into_iter().for_each(&handle_stdout_line);
                    if let Some(line) = stderr.finish() {
                        state.record_stderr(line);
                    }
                    match state.on_terminated(generation, payload.code) {
                        TerminatedAction::Ignore => {}
                        TerminatedAction::Failed => emit(&app, &state.failure_announcement()),
                        TerminatedAction::Restart => {
                            if let Err(reason) = start_backend(&app, &state) {
                                *state.error.lock().unwrap() = Some(reason);
                                emit(&app, &state.failure_announcement());
                            }
                        }
                    }
                    break;
                }
                _ => {}
            }
        }
    });
    Ok(child)
}

/// Waits for the handshake off the async runtime's worker threads.
pub async fn api_base_url(app: AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<BackendState>();
        wait_for_handshake(&state, HANDSHAKE_TIMEOUT).map(base_url)
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
        assert_eq!(state.on_terminated(1, Some(1)), TerminatedAction::Restart);
        assert_eq!(*state.port.lock().unwrap(), None);

        state.reset_for_spawn();
        state.record_stderr("Unhandled exception: boom".to_string());
        state.record_stderr(String::new());
        assert_eq!(state.on_terminated(2, Some(134)), TerminatedAction::Failed);
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
        assert_eq!(state.on_terminated(1, Some(1)), TerminatedAction::Failed);
        assert_eq!(
            wait_for_handshake(&state, Duration::from_millis(10)),
            Err("database is locked".to_string())
        );
    }

    #[test]
    fn exit_while_stopping_is_not_restarted() {
        let state = BackendState::default();
        assert_eq!(stop(&state), Ok(()));
        assert_eq!(state.on_terminated(1, Some(0)), TerminatedAction::Ignore);
        assert!(state.life.lock().unwrap().has_terminated(1));
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

    /// Stand-in for `CommandChild`; `kill` records that it happened.
    struct FakeChild(std::sync::Arc<AtomicU8>);

    impl Killable for FakeChild {
        fn kill(self) -> Result<(), String> {
            self.0.fetch_add(1, Ordering::SeqCst);
            Ok(())
        }
    }

    fn fake() -> (FakeChild, std::sync::Arc<AtomicU8>) {
        let kills = std::sync::Arc::new(AtomicU8::new(0));
        (FakeChild(kills.clone()), kills)
    }

    #[test]
    fn stop_after_crash_before_restart_blocks_the_restart() {
        // Race A: the process died and was judged "restart", then stop ran.
        let life = Mutex::new(Lifecycle::<FakeChild>::default());
        life.lock().unwrap().start(|_| Ok(fake().0)).unwrap();
        assert!(!life.lock().unwrap().ended(1));

        assert_eq!(stop_lifecycle(&life, Duration::from_millis(200)), Ok(()));

        let mut spawned = false;
        let started = life.lock().unwrap().start(|_| {
            spawned = true;
            Ok(fake().0)
        });
        assert_eq!(started, Ok(None));
        assert!(!spawned);
        assert!(!life.lock().unwrap().has_child());
    }

    #[test]
    fn stop_between_clear_and_store_blocks_the_restart() {
        // Race B: the child slot is empty while the restart is pending.
        let life = Mutex::new(Lifecycle::<FakeChild>::default());
        life.lock().unwrap().start(|_| Ok(fake().0)).unwrap();
        life.lock().unwrap().ended(1);
        assert!(!life.lock().unwrap().has_child());

        assert_eq!(stop_lifecycle(&life, Duration::from_millis(200)), Ok(()));

        assert_eq!(life.lock().unwrap().start(|_| Ok(fake().0)), Ok(None));
        assert!(!life.lock().unwrap().has_child());
    }

    #[test]
    fn stop_waits_for_the_child_it_killed_not_an_earlier_one() {
        let life = std::sync::Arc::new(Mutex::new(Lifecycle::<FakeChild>::default()));
        // Generation 1 crashed earlier; generation 2 is the live one.
        life.lock().unwrap().start(|_| Ok(fake().0)).unwrap();
        life.lock().unwrap().ended(1);
        let (child, kills) = fake();
        life.lock().unwrap().start(|_| Ok(child)).unwrap();

        // The stale "generation 1 ended" must not satisfy the wait.
        let result = stop_lifecycle(&life, Duration::from_millis(150));
        assert!(result.unwrap_err().contains("did not exit"));
        assert_eq!(kills.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn stop_returns_once_the_killed_generation_ends() {
        let life = std::sync::Arc::new(Mutex::new(Lifecycle::<FakeChild>::default()));
        life.lock().unwrap().start(|_| Ok(fake().0)).unwrap();
        let reader = life.clone();
        let handle = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(100));
            assert!(reader.lock().unwrap().ended(1));
        });
        assert_eq!(stop_lifecycle(&life, Duration::from_secs(5)), Ok(()));
        handle.join().unwrap();
    }

    #[test]
    fn announces_the_base_url_on_a_port_handshake_only() {
        assert_eq!(
            announcement_for(&Handshake::Port(5123)),
            Some(Announcement::Ready("http://127.0.0.1:5123/api".to_string()))
        );
        assert_eq!(announcement_for(&Handshake::Error("x".to_string())), None);
    }

    #[test]
    fn announcement_event_names_and_payloads() {
        let ready = Announcement::Ready("http://127.0.0.1:1/api".to_string());
        assert_eq!(ready.event(), "backend://ready");
        assert_eq!(ready.payload(), "http://127.0.0.1:1/api");
        let failed = Announcement::Failed("boom".to_string());
        assert_eq!(failed.event(), "backend://failed");
        assert_eq!(failed.payload(), "boom");
    }

    #[test]
    fn final_failure_announces_the_stored_reason() {
        let state = BackendState::default();
        state.restarts.store(1, Ordering::SeqCst);
        state.record_stderr("boom".to_string());
        assert_eq!(state.on_terminated(1, Some(2)), TerminatedAction::Failed);
        assert_eq!(
            state.failure_announcement(),
            Announcement::Failed("backend exited unexpectedly (code 2): boom".to_string())
        );
    }
}
