using System.Diagnostics;
using System.Net;

namespace TypeLab.Api.Tests;

/// <summary>
/// Starts the real API as a sidecar process, the way the desktop shell does.
/// Disposal always kills the process tree so a failed assertion leaves nothing behind.
/// </summary>
public sealed class SidecarHostTests : IAsyncLifetime
{
    private readonly List<SidecarProcess> _started = [];
    private readonly string _root = Path.Combine(Path.GetTempPath(), "typelab-sidecar-" + Guid.NewGuid().ToString("N"));

    private string DbPath => Path.Combine(_root, "空 白", "typelab.db");

    public Task InitializeAsync() => Task.CompletedTask;

    public async Task DisposeAsync()
    {
        foreach (var p in _started)
        {
            await p.DisposeAsync();
        }

        try
        {
            if (Directory.Exists(_root))
            {
                Directory.Delete(_root, true);
            }
        }
        catch (IOException)
        {
            // The temp folder is disposable; a lingering file handle is not a test failure.
        }
    }

    private SidecarProcess Launch(string? dbPath = null)
    {
        var p = new SidecarProcess(dbPath ?? DbPath);
        _started.Add(p);
        return p;
    }

    private async Task<SidecarProcess> StartAsync()
    {
        var p = Launch();
        await p.WaitForPortAsync(TimeSpan.FromSeconds(30));
        return p;
    }

    private static HttpClient NoRedirectClient() =>
        new(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(20) };

    [Fact]
    public async Task Health_answers_over_plain_http_without_redirect()
    {
        var sidecar = await StartAsync();
        using var http = NoRedirectClient();

        var response = await http.GetAsync($"http://127.0.0.1:{sidecar.Port}/api/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Database_is_created_at_TYPELAB_DB_PATH()
    {
        await StartAsync();

        Assert.True(File.Exists(DbPath), $"expected database at {DbPath}");
    }

    [Theory]
    [InlineData("tauri://localhost")]
    [InlineData("http://tauri.localhost")]
    public async Task Cors_allows_tauri_origins(string origin)
    {
        var sidecar = await StartAsync();
        using var http = NoRedirectClient();
        using var request = new HttpRequestMessage(HttpMethod.Get, $"http://127.0.0.1:{sidecar.Port}/api/health");
        request.Headers.Add("Origin", origin);

        var response = await http.SendAsync(request);

        Assert.True(response.Headers.TryGetValues("Access-Control-Allow-Origin", out var values));
        Assert.Equal(origin, Assert.Single(values));
    }

    [Fact]
    public async Task Closing_stdin_stops_the_process()
    {
        var sidecar = await StartAsync();

        sidecar.CloseStdin();

        Assert.True(await sidecar.WaitForExitAsync(TimeSpan.FromSeconds(10)), "process did not exit after stdin closed");
    }

    [Fact]
    public async Task Two_sidecars_share_one_database()
    {
        // Both are launched before either is awaited, so they race on a fresh database.
        var first = Launch();
        var second = Launch();
        await Task.WhenAll(
            first.WaitForPortAsync(TimeSpan.FromSeconds(60)),
            second.WaitForPortAsync(TimeSpan.FromSeconds(60)));
        using var http = NoRedirectClient();

        var a = await http.GetAsync($"http://127.0.0.1:{first.Port}/api/health");
        var b = await http.GetAsync($"http://127.0.0.1:{second.Port}/api/health");

        Assert.Equal(HttpStatusCode.OK, a.StatusCode);
        Assert.Equal(HttpStatusCode.OK, b.StatusCode);
    }

    [Fact]
    public async Task Unwritable_database_path_reports_ELF_SIDECAR_ERROR()
    {
        // A path below a regular file can never be created, on any OS.
        Directory.CreateDirectory(_root);
        var blocker = Path.Combine(_root, "blocker");
        await File.WriteAllTextAsync(blocker, "not a directory");
        var sidecar = Launch(Path.Combine(blocker, "sub", "typelab.db"));

        var exited = await sidecar.WaitForExitAsync(TimeSpan.FromSeconds(30));

        Assert.True(exited, "process should exit on database failure");
        Assert.Equal(1, sidecar.ExitCode);
        var errors = sidecar.OutputLines.Where(l => l.StartsWith("ELF_SIDECAR_ERROR=", StringComparison.Ordinal)).ToList();
        Assert.Single(errors);
        Assert.DoesNotContain(sidecar.OutputLines, l => l.StartsWith("ELF_SIDECAR_PORT=", StringComparison.Ordinal));
    }

    private sealed class SidecarProcess : IAsyncDisposable
    {
        private const string PortPrefix = "ELF_SIDECAR_PORT=";
        private readonly Process _process;
        private readonly TaskCompletionSource<int> _port = new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly List<string> _output = [];

        public int Port { get; private set; }

        public int ExitCode => _process.ExitCode;

        public IReadOnlyList<string> OutputLines
        {
            get
            {
                lock (_output)
                {
                    return [.. _output];
                }
            }
        }

        public SidecarProcess(string dbPath)
        {
            var dll = Path.Combine(AppContext.BaseDirectory, "TypeLab.Api.dll");
            var info = new ProcessStartInfo("dotnet")
            {
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
                WorkingDirectory = AppContext.BaseDirectory,
            };
            info.ArgumentList.Add(dll);
            info.Environment["ELF_SIDECAR"] = "1";
            info.Environment["TYPELAB_DB_PATH"] = dbPath;
            info.Environment["ASPNETCORE_ENVIRONMENT"] = "Production";
            // Without a known HTTPS port the redirect middleware only logs a warning,
            // which would let a stray UseHttpsRedirection() pass unnoticed.
            info.Environment["ASPNETCORE_HTTPS_PORT"] = "44300";

            _process = new Process { StartInfo = info };
            _process.OutputDataReceived += (_, e) =>
            {
                if (e.Data is null)
                {
                    return;
                }

                lock (_output)
                {
                    _output.Add(e.Data);
                }

                if (e.Data.StartsWith(PortPrefix, StringComparison.Ordinal)
                    && int.TryParse(e.Data[PortPrefix.Length..], out var port))
                {
                    _port.TrySetResult(port);
                }
            };
            _process.ErrorDataReceived += (_, e) =>
            {
                if (e.Data is not null)
                {
                    lock (_output)
                    {
                        _output.Add("[err] " + e.Data);
                    }
                }
            };
            _process.Start();
            _process.BeginOutputReadLine();
            _process.BeginErrorReadLine();
        }

        public async Task WaitForPortAsync(TimeSpan timeout)
        {
            var done = await Task.WhenAny(_port.Task, _process.WaitForExitAsync(), Task.Delay(timeout));
            if (done != _port.Task)
            {
                string log;
                lock (_output)
                {
                    log = string.Join(Environment.NewLine, _output);
                }

                throw new TimeoutException($"No {PortPrefix} line within {timeout.TotalSeconds}s (exited: {_process.HasExited}). Output:{Environment.NewLine}{log}");
            }

            Port = await _port.Task;
        }

        public void CloseStdin() => _process.StandardInput.Close();

        public async Task<bool> WaitForExitAsync(TimeSpan timeout)
        {
            using var cts = new CancellationTokenSource(timeout);
            try
            {
                await _process.WaitForExitAsync(cts.Token);
                return true;
            }
            catch (OperationCanceledException)
            {
                return false;
            }
        }

        public async ValueTask DisposeAsync()
        {
            try
            {
                if (!_process.HasExited)
                {
                    _process.Kill(entireProcessTree: true);
                    await _process.WaitForExitAsync();
                }
            }
            catch (InvalidOperationException)
            {
                // Already gone.
            }
            finally
            {
                _process.Dispose();
            }
        }
    }
}
