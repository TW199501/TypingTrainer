using System.Runtime.InteropServices;

namespace TypeLab.Api.Data;

public sealed class ModelStorageOptions
{
    /// <summary>
    /// Where model files live. A relative value is resolved against the content
    /// root; an absolute one is taken as-is. Empty means "use the per-OS default".
    /// Override with the <c>Models__Directory</c> environment variable — the
    /// Docker deployment points it at the /data volume.
    /// </summary>
    public string? Directory { get; set; }
}

/// <summary>
/// Resolves the model directory for the process that owns the disk.
///
/// The same Models page runs in three places and the answer differs in each:
///   - Desktop (Tauri): the OS app-data directory, resolved in Rust, not here.
///   - Server (Docker): a mounted volume, set via Models__Directory.
///   - Server (local dev): a per-user data directory, or ./models.
///
/// That is why the path is never hard-coded in the front end and never stored
/// in the database — it is reported by whoever actually holds the files.
/// </summary>
public sealed class ModelStorage
{
    public string Root { get; }

    public ModelStorage(IConfiguration config, IHostEnvironment env)
    {
        var configured = config.GetSection("Models")["Directory"];

        Root = string.IsNullOrWhiteSpace(configured)
            ? DefaultRoot(env)
            : Path.IsPathRooted(configured)
                ? configured
                : Path.GetFullPath(Path.Combine(env.ContentRootPath, configured));
    }

    /// <summary>
    /// Per-user data directory, matching the convention the desktop shell uses:
    /// %LOCALAPPDATA% on Windows (Local, not Roaming — these files reach
    /// gigabytes and must not sync), ~/Library/Application Support on macOS,
    /// $XDG_DATA_HOME or ~/.local/share elsewhere.
    /// </summary>
    private static string DefaultRoot(IHostEnvironment env)
    {
        string? baseDir = null;

        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            baseDir = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        }
        else if (RuntimeInformation.IsOSPlatform(OSPlatform.OSX))
        {
            var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            if (!string.IsNullOrEmpty(home)) baseDir = Path.Combine(home, "Library", "Application Support");
        }
        else
        {
            baseDir = Environment.GetEnvironmentVariable("XDG_DATA_HOME");
            if (string.IsNullOrEmpty(baseDir))
            {
                var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                if (!string.IsNullOrEmpty(home)) baseDir = Path.Combine(home, ".local", "share");
            }
        }

        // A container often has neither a home directory nor LOCALAPPDATA;
        // falling back to the content root keeps it working rather than
        // throwing at start-up.
        return string.IsNullOrEmpty(baseDir)
            ? Path.GetFullPath(Path.Combine(env.ContentRootPath, "models"))
            : Path.Combine(baseDir, "TypeLab", "models");
    }

    /// <summary>Folder a given model's files belong in.</summary>
    public string PathFor(string code) => Path.Combine(Root, code);

    public bool Exists => System.IO.Directory.Exists(Root);

    /// <summary>Bytes actually on disk, which can differ from the catalogue sizes.</summary>
    public long UsedBytes()
    {
        if (!Exists) return 0;
        return new DirectoryInfo(Root)
            .EnumerateFiles("*", SearchOption.AllDirectories)
            .Sum(f => f.Length);
    }

    /// <summary>Creates the directory and reports whether it can be written to.</summary>
    public bool EnsureWritable()
    {
        try
        {
            System.IO.Directory.CreateDirectory(Root);
            var probe = Path.Combine(Root, ".write-probe");
            File.WriteAllText(probe, string.Empty);
            File.Delete(probe);
            return true;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            return false;
        }
    }
}
