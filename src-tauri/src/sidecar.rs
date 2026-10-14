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

/// Longest `api_base_url` waits for a live sidecar's handshake. Cold starts
/// measured 6-11 s on CI runners; a failed or stopped backend ends the wait at
/// once instead.
pub const HANDSHAKE_CAP: Duration = Duration::from_secs(60);
/// How long `stop` waits for the sidecar to exit after closing its stdin.
pub const STOP_GRACE: Duration = Duration::from_secs(5);
/// How long `stop` then waits for `Terminated` after force-killing it.
pub const KILL_TIMEOUT: Duration = Duration::from_secs(2);
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

/// A running child that `stop` ends: gently first, by force if it must.
pub trait Stoppable {
    type Killer: ForceKill;
    /// Closes the child's stdin, on which the sidecar exits by itself, and
    /// returns what can still kill it.
    fn close_stdin(self) -> Self::Killer;
}

/// Ends a process that ignored its stdin closing.
pub trait ForceKill {
    fn force_kill(self) -> Result<(), String>;
}

impl Stoppable for CommandChild {
    type Killer = Pid;

    fn close_stdin(self) -> Pid {
        let pid = Pid(self.pid());
        // The plugin has no call that closes stdin alone: the parent's end of
        // the pipe lives in `CommandChild` and closes when it is dropped.
        drop(self);
        pid
    }
}

/// A child known only by its process id, once its `CommandChild` is gone.
pub struct Pid(u32);

impl ForceKill for Pid {
    fn force_kill(self) -> Result<(), String> {
        kill_pid(self.0)
    }
}

/// Kills a process by id with the OS tool, without opening a console window.
fn kill_pid(pid: u32) -> Result<(), String> {
    #[cfg(windows)]
    let mut command = {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let mut command = std::process::Command::new("taskkill");
        command
            .args(["/PID", &pid.to_string(), "/F"])
            .creation_flags(CREATE_NO_WINDOW);
        command
    };
    #[cfg(not(windows))]
    let mut command = {
        let mut command = std::process::Command::new("kill");
        command.args(["-KILL", &pid.to_string()]);
        command
    };
    let status = command
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map_err(|e| format!("cannot run the kill command: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("kill of process {pid} failed ({status})"))
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

    /// True once `begin_stop` ran; no child will run again.
    pub fn is_stopping(&self) -> bool {
        self.stopping
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
pub fn stop_lifecycle<C: Stoppable>(
    life: &Mutex<Lifecycle<C>>,
    grace: Duration,
    kill_timeout: Duration,
) -> Result<(), String> {
    let Some((generation, child)) = life.lock().unwrap().begin_stop() else {
        return Ok(());
    };
    let killer = child.close_stdin();
    if wait_until_terminated(life, generation, grace) {
        return Ok(());
    }
    // A failed kill usually means the process is already gone; the wait below
    // still decides whether it really ended.
    let kill_error = killer.force_kill().err();
    if wait_until_terminated(life, generation, kill_timeout) {
        return Ok(());
    }
    Err(match kill_error {
        Some(e) => format!("cannot stop the backend: {e}"),
        None => format!(
            "the backend did not exit within {} s",
            (grace + kill_timeout).as_secs()
        ),
    })
}

/// Polls until generation `generation` has ended; false once `timeout` passed.
fn wait_until_terminated<C>(
    life: &Mutex<Lifecycle<C>>,
    generation: u64,
    timeout: Duration,
) -> bool {
    let start = Instant::now();
    loop {
        if life.lock().unwrap().has_terminated(generation) {
            return true;
        }
        if start.elapsed() >= timeout {
            return false;
        }
        std::thread::sleep(POLL_INTERVAL);
    }
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

/// Blocks until the sidecar reported its port, until it failed for good or
/// was stopped (both end the wait at once), or until `cap`.
pub fn wait_for_handshake(state: &BackendState, cap: Duration) -> Result<u16, String> {
    let start = Instant::now();
    loop {
        if let Some(port) = *state.port.lock().unwrap() {
            return Ok(port);
        }
        if let Some(error) = state.error.lock().unwrap().clone() {
            return Err(error);
        }
        if state.life.lock().unwrap().is_stopping() {
            return Err("the backend was stopped".to_string());
        }
        if start.elapsed() >= cap {
            return Err(format!(
                "timed out (逾時) after {} s waiting for the backend to start",
                cap.as_secs()
            ));
        }
        std::thread::sleep(POLL_INTERVAL);
    }
}

/// Stops the sidecar. Having no child is not an error.
pub fn stop(state: &BackendState) -> Result<(), String> {
    stop_lifecycle(&state.life, STOP_GRACE, KILL_TIMEOUT)
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
/// runs before (and the start is refused) or after (and stops this child).
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
        wait_for_handshake(&state, HANDSHAKE_CAP).map(base_url)
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
    fn keeps_waiting_while_alive_until_the_cap() {
        let state = BackendState::default();
        let started = Instant::now();
        let result = wait_for_handshake(&state, Duration::from_millis(300));
        assert!(started.elapsed() >= Duration::from_millis(300));
        assert!(result.unwrap_err().contains("timed out"));
    }

    #[test]
    fn the_cap_is_sixty_seconds() {
        assert_eq!(HANDSHAKE_CAP, Duration::from_secs(60));
    }

    #[test]
    fn returns_immediately_when_the_process_exits() {
        let state = std::sync::Arc::new(BackendState::default());
        let events = state.clone();
        let handle = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(100));
            // First exit restarts; the restarted process exits too.
            assert_eq!(events.on_terminated(1, Some(1)), TerminatedAction::Restart);
            events.reset_for_spawn();
            assert_eq!(events.on_terminated(2, Some(1)), TerminatedAction::Failed);
        });
        let started = Instant::now();
        let result = wait_for_handshake(&state, Duration::from_secs(5));
        handle.join().unwrap();
        assert!(started.elapsed() < Duration::from_secs(2));
        assert!(result.unwrap_err().contains("exited unexpectedly"));
    }

    #[test]
    fn returns_immediately_when_the_backend_is_stopped() {
        let state = std::sync::Arc::new(BackendState::default());
        let stopper = state.clone();
        let handle = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(100));
            assert_eq!(stop(&stopper), Ok(()));
        });
        let started = Instant::now();
        let result = wait_for_handshake(&state, Duration::from_secs(5));
        handle.join().unwrap();
        assert!(started.elapsed() < Duration::from_secs(2));
        assert!(result.unwrap_err().contains("stopped"));
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

    /// What a fake child saw, in order: "close" (stdin) and "kill".
    type Log = std::sync::Arc<Mutex<Vec<&'static str>>>;

    /// Stand-in for `CommandChild`; records the stop steps it receives.
    struct FakeChild(Log);

    struct FakeKiller(Log, Result<(), String>);

    impl Stoppable for FakeChild {
        type Killer = FakeKiller;

        fn close_stdin(self) -> FakeKiller {
            self.0.lock().unwrap().push("close");
            FakeKiller(self.0, Ok(()))
        }
    }

    impl ForceKill for FakeKiller {
        fn force_kill(self) -> Result<(), String> {
            self.0.lock().unwrap().push("kill");
            self.1
        }
    }

    fn fake() -> (FakeChild, Log) {
        let log = Log::default();
        (FakeChild(log.clone()), log)
    }

    const SHORT: Duration = Duration::from_millis(100);

    /// Ends generation 1 once `step` shows up in `log`, as the event loop would.
    fn end_after(
        life: &std::sync::Arc<Mutex<Lifecycle<FakeChild>>>,
        log: &Log,
        step: &'static str,
    ) -> std::thread::JoinHandle<()> {
        let (life, log) = (life.clone(), log.clone());
        std::thread::spawn(move || {
            while !log.lock().unwrap().contains(&step) {
                std::thread::sleep(Duration::from_millis(5));
            }
            life.lock().unwrap().ended(1);
        })
    }

    #[test]
    fn stop_after_crash_before_restart_blocks_the_restart() {
        // Race A: the process died and was judged "restart", then stop ran.
        let life = Mutex::new(Lifecycle::<FakeChild>::default());
        life.lock().unwrap().start(|_| Ok(fake().0)).unwrap();
        assert!(!life.lock().unwrap().ended(1));

        assert_eq!(stop_lifecycle(&life, SHORT, SHORT), Ok(()));

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

        assert_eq!(stop_lifecycle(&life, SHORT, SHORT), Ok(()));

        assert_eq!(life.lock().unwrap().start(|_| Ok(fake().0)), Ok(None));
        assert!(!life.lock().unwrap().has_child());
    }

    #[test]
    fn stop_closes_stdin_and_never_kills_a_child_that_exits() {
        let life = std::sync::Arc::new(Mutex::new(Lifecycle::<FakeChild>::default()));
        let (child, log) = fake();
        life.lock().unwrap().start(|_| Ok(child)).unwrap();
        let exits = end_after(&life, &log, "close");

        assert_eq!(stop_lifecycle(&life, Duration::from_secs(5), SHORT), Ok(()));

        exits.join().unwrap();
        assert_eq!(*log.lock().unwrap(), vec!["close"]);
    }

    #[test]
    fn stop_kills_a_child_that_ignores_its_stdin_closing() {
        let life = std::sync::Arc::new(Mutex::new(Lifecycle::<FakeChild>::default()));
        let (child, log) = fake();
        life.lock().unwrap().start(|_| Ok(child)).unwrap();
        let dies = end_after(&life, &log, "kill");

        let started = Instant::now();
        assert_eq!(stop_lifecycle(&life, SHORT, Duration::from_secs(5)), Ok(()));

        dies.join().unwrap();
        assert_eq!(*log.lock().unwrap(), vec!["close", "kill"]);
        // The kill waited for the grace period first.
        assert!(started.elapsed() >= SHORT);
    }

    #[test]
    fn stop_reports_a_failed_kill_when_the_child_survives() {
        let life = Mutex::new(Lifecycle::<FakeKillFails>::default());
        life.lock().unwrap().start(|_| Ok(FakeKillFails)).unwrap();

        let result = stop_lifecycle(&life, SHORT, SHORT);

        assert_eq!(
            result,
            Err("cannot stop the backend: access denied".to_string())
        );
    }

    struct FakeKillFails;

    impl Stoppable for FakeKillFails {
        type Killer = FakeKiller;

        fn close_stdin(self) -> FakeKiller {
            FakeKiller(Log::default(), Err("access denied".to_string()))
        }
    }

    #[test]
    fn stop_waits_for_the_child_it_stopped_not_an_earlier_one() {
        let life = std::sync::Arc::new(Mutex::new(Lifecycle::<FakeChild>::default()));
        // Generation 1 crashed earlier; generation 2 is the live one.
        life.lock().unwrap().start(|_| Ok(fake().0)).unwrap();
        life.lock().unwrap().ended(1);
        let (child, log) = fake();
        life.lock().unwrap().start(|_| Ok(child)).unwrap();

        // The stale "generation 1 ended" must not satisfy the wait.
        let result = stop_lifecycle(&life, SHORT, SHORT);
        assert!(result.unwrap_err().contains("did not exit"));
        assert_eq!(*log.lock().unwrap(), vec!["close", "kill"]);
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
