namespace TypeLab.Api;

/// <summary>
/// Whether this process was started as a sidecar, read before the host exists.
/// Mirrors ELF.Modules.Hosting.Sidecar 0.8.1: <c>ELF_SIDECAR</c> or
/// <c>Elf:Hosting:Sidecar:Enabled</c>, each accepting 1/0 or true/false in any
/// case with surrounding spaces ignored.
/// </summary>
public static class SidecarSignal
{
    public const string EnvironmentVariable = "ELF_SIDECAR";
    public const string EnabledKey = "Elf:Hosting:Sidecar:Enabled";

    /// <summary>
    /// A value the package cannot read counts as off here; <c>UseElfSidecar</c>
    /// then fails startup with its own message.
    /// </summary>
    public static bool IsRequested(string? environmentValue, IConfiguration config) =>
        IsOn(environmentValue) || IsOn(config[EnabledKey]);

    private static bool IsOn(string? value)
    {
        var trimmed = value?.Trim();
        return trimmed == "1" || (bool.TryParse(trimmed, out var on) && on);
    }
}
