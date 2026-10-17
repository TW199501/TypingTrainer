namespace TypeLab.Api.Data;

/// <summary>A library operation that failed in a way the caller can act on; <see cref="Status"/> is the HTTP status.</summary>
public class LibraryException(int status, string message, IReadOnlyList<string>? failed = null, int? failedCount = null)
    : Exception(message)
{
    public int Status { get; } = status;

    /// <summary>Which items of a batch were rejected (file names, 1-based positions, or file record numbers).</summary>
    public IReadOnlyList<string>? Failed { get; } = failed;

    /// <summary>How many items were rejected in all, when <see cref="Failed"/> lists only the first of them.</summary>
    public int? FailedCount { get; } = failedCount;
}
