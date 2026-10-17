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

    /// <summary>How far into a text file the sniff looks for its first non-empty line.</summary>
    private const int SniffBytes = 64 * 1024;

    /// <summary>
    /// The format name and read options for <paramref name="fileName"/>: .xlsx is detected by
    /// its signature, .csv reads commas, .tsv tabs, and .txt whichever its first non-empty line
    /// uses. In a text file the blank lines above the header are skipped, so the first
    /// non-empty line is the header.
    /// </summary>
    public static (string Format, ExcelImportOptions Options) OptionsFor(string? fileName, Stream stream)
    {
        var options = new ExcelImportOptions { TrimHeaders = true, TrimValues = true, SkipEmptyRows = true };
        var extension = Path.GetExtension(fileName ?? "").ToLowerInvariant();
        if (extension == ".xlsx")
        {
            return ("xlsx", options);
        }

        if (extension is not (".csv" or ".tsv" or ".txt"))
        {
            throw new LibraryException(400, "Unsupported file type. Use .xlsx, .csv, .tsv or .txt.");
        }

        var head = Sniff(stream);
        options = options with { HeaderRowIndex = head.BlankLines };
        return extension switch
        {
            ".csv" => ("csv", options with { Format = ExcelImportFormat.Csv, Delimiter = ',' }),
            ".tsv" => ("tsv", options with { Format = ExcelImportFormat.Csv, Delimiter = '\t' }),
            _ => ("txt", options with { Format = ExcelImportFormat.Txt, Delimiter = head.HasTab ? '\t' : ',' }),
        };
    }

    /// <summary>
    /// The 1-based number of a data row counted from the first row under the header, from the
    /// importer's <see cref="ExcelImportRow.RowNumber"/>, which also counts the header and the
    /// lines skipped above it.
    /// </summary>
    public static int DataRowNumber(ExcelImportRow row, ExcelImportOptions options) =>
        row.RowNumber - options.HeaderRowIndex - 1;

    /// <summary>The blank lines above the first non-empty line, and whether that line holds a tab.</summary>
    private readonly record struct Head(int BlankLines, bool HasTab);

    /// <summary>
    /// Finds the first line that holds more than spaces and tabs. Tab, space, comma and line
    /// breaks are single bytes in UTF-8 and never a Big5 trail byte, so bytes are enough.
    /// </summary>
    private static Head Sniff(Stream stream)
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
        var blankLines = 0;
        var lineHasText = false;
        var lineHasTab = false;
        for (var i = start; i < read; i++)
        {
            var b = buffer[i];
            if (b is (byte)'\r' or (byte)'\n')
            {
                if (lineHasText)
                {
                    return new Head(blankLines, lineHasTab);
                }

                blankLines++;
                lineHasTab = false;
                if (b == (byte)'\r' && i + 1 < read && buffer[i + 1] == (byte)'\n')
                {
                    i++;
                }
            }
            else if (b == (byte)'\t')
            {
                lineHasTab = true;
            }
            else if (b != (byte)' ')
            {
                lineHasText = true;
            }
        }

        // No line break after the first text, or nothing but blank lines in the window.
        return lineHasText ? new Head(blankLines, lineHasTab) : new Head(0, false);
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
