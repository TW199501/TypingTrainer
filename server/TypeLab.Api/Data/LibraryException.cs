namespace TypeLab.Api.Data;

/// <summary>A library operation that failed in a way the caller can act on; <see cref="Status"/> is the HTTP status.</summary>
public class LibraryException(int status, string message, IReadOnlyList<string>? failed = null)
    : Exception(message)
{
    public int Status { get; } = status;

    /// <summary>Which items of a batch were rejected (file names, or 1-based positions).</summary>
    public IReadOnlyList<string>? Failed { get; } = failed;
}
