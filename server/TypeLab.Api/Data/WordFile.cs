using System.Globalization;
using System.Runtime.CompilerServices;
using ELF.Modules.Excel.Abstractions;
using ELF.Modules.Excel.Abstractions.Enums;
using ELF.Modules.Excel.Abstractions.Importing;

namespace TypeLab.Api.Data;

/// <summary>
/// A dictionary file as rows of text: picks the read options from the file name and
/// turns whatever <see cref="IExcelImporter"/> hands back into strings.
/// </summary>
public static class WordFile
{
    /// <summary>The largest upload the import endpoints accept, the same as the importer's own limit (256 MiB).</summary>
    public const long MaxBytes = ExcelConstants.DefaultMaxImportBytes;

    /// <summary>How far into a .txt file the delimiter sniff looks for its first non-empty line.</summary>
    private const int SniffBytes = 64 * 1024;

    /// <summary>
    /// The format name and read options for <paramref name="fileName"/>: .xlsx is detected by
    /// its signature, .csv reads commas, .tsv tabs, and .txt whichever its first non-empty line uses.
    /// </summary>
    public static (string Format, ExcelImportOptions Options) OptionsFor(string? fileName, Stream stream)
    {
        var options = new ExcelImportOptions { TrimHeaders = true, TrimValues = true, SkipEmptyRows = true };
        return Path.GetExtension(fileName ?? "").ToLowerInvariant() switch
        {
            ".xlsx" => ("xlsx", options),
            ".csv" => ("csv", options with { Format = ExcelImportFormat.Csv, Delimiter = ',' }),
            ".tsv" => ("tsv", options with { Format = ExcelImportFormat.Csv, Delimiter = '\t' }),
            ".txt" => ("txt", options with { Format = ExcelImportFormat.Txt, Delimiter = HasTab(stream) ? '\t' : ',' }),
            _ => throw new LibraryException(400, "Unsupported file type. Use .xlsx, .csv, .tsv or .txt."),
        };
    }

    /// <summary>
    /// True when the first non-empty line of the file contains a tab. Tab, comma and line
    /// breaks are single bytes in UTF-8 and never a Big5 trail byte, so bytes are enough.
    /// </summary>
    private static bool HasTab(Stream stream)
    {
        var buffer = new byte[SniffBytes];
        stream.Position = 0;
        var read = 0;
        int n;
        while (read < buffer.Length && (n = stream.Read(buffer, read, buffer.Length - read)) > 0)
        {
            read += n;
        }

        stream.Position = 0;
        var start = read >= 3 && buffer[0] == 0xEF && buffer[1] == 0xBB && buffer[2] == 0xBF ? 3 : 0;
        var lineHasText = false;
        for (var i = start; i < read; i++)
        {
            switch (buffer[i])
            {
                case (byte)'\t':
                    return true;
                case (byte)'\n' or (byte)'\r':
                    if (lineHasText)
                    {
                        return false;
                    }

                    break;
                case (byte)' ':
                    break;
                default:
                    lineHasText = true;
                    break;
            }
        }

        return false;
    }

    /// <summary>One cell as text: workbook numbers, dates and booleans in an invariant form, an empty cell as "".</summary>
    public static string Text(object? value) => value switch
    {
        null => "",
        string s => s,
        double d => d.ToString(CultureInfo.InvariantCulture),
        DateTime dt => dt.TimeOfDay == TimeSpan.Zero
            ? dt.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
            : dt.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture),
        bool b => b ? "TRUE" : "FALSE",
        IFormattable f => f.ToString(null, CultureInfo.InvariantCulture),
        _ => value.ToString() ?? "",
    };

    /// <summary>
    /// The rows of the file, with a file the importer cannot read (a damaged workbook, a text
    /// file in an encoding it cannot decode, too many rows) reported as a 400.
    /// </summary>
    public static async IAsyncEnumerable<ExcelImportRow> ReadAsync(
        IExcelImporter importer, Stream stream, ExcelImportOptions options,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        var rows = importer.ReadAsync(stream, options, ct).GetAsyncEnumerator(ct);
        try
        {
            while (true)
            {
                bool more;
                try
                {
                    more = await rows.MoveNextAsync();
                }
                catch (Exception ex) when (ex is InvalidOperationException or ArgumentException)
                {
                    throw new LibraryException(400, "The file could not be read: " + ex.Message);
                }

                if (!more)
                {
                    yield break;
                }

                yield return rows.Current;
            }
        }
        finally
        {
            await rows.DisposeAsync();
        }
    }

    /// <summary>
    /// The header row on its own, for a file with no data rows: read once more without a
    /// header so the first row comes back as values.
    /// </summary>
    public static async Task<List<string>> HeadersOnlyAsync(
        IExcelImporter importer, Stream stream, ExcelImportOptions options, CancellationToken ct)
    {
        await foreach (var row in ReadAsync(importer, stream, options with { HasHeader = false }, ct))
        {
            return row.Values.Values.Select(v => Text(v).Trim()).Where(h => h.Length > 0).ToList();
        }

        return [];
    }
}
