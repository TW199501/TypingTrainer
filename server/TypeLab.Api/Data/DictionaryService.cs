using ELF.Modules.Excel.Abstractions.Importing;
using SqlSugar;
using TypeLab.Api.Api;
using TypeLab.Api.Models;

namespace TypeLab.Api.Data;

/// <summary>Reads the dictionary with the local user's mastery, and imports word files into it.</summary>
public class DictionaryService(ISqlSugarClient db, IExcelImporter importer)
{
    private const string DefaultTopic = "Uncategorised";

    /// <summary>Data rows a preview returns.</summary>
    public const int SampleRows = 3;

    /// <summary>Words stored per insert batch.</summary>
    private const int InsertBatch = 1000;

    /// <summary>Data-row numbers a rejected import lists; the total comes as <c>failedCount</c>.</summary>
    public const int MaxFailedReported = 50;

    public async Task<(List<DictEntryDto> Rows, int Total)> ListAsync(string? topic, string? q, int page, int size)
    {
        size = Math.Clamp(size, 1, 500);
        page = Math.Max(page, 1);

        var query = db.Queryable<Word>();
        if (!string.IsNullOrWhiteSpace(topic))
        {
            var wanted = topic.Trim();
            query = query.Where(w => w.Topic == wanted);
        }

        if (!string.IsNullOrWhiteSpace(q))
        {
            var needle = q.Trim().ToLowerInvariant();
            query = query.Where(w => w.Text.ToLower().Contains(needle) || (w.Zh ?? "").ToLower().Contains(needle));
        }

        RefAsync<int> total = 0;
        var words = await query.OrderBy(w => w.Id).ToPageListAsync(page, size, total);
        if (words.Count == 0)
        {
            return ([], total.Value);
        }

        var ids = words.Select(w => w.Id).ToList();
        var userId = LocalUserSeeds.Seed(db);
        var mastery = (await db.Queryable<UserWordMastery>()
                .Where(m => m.UserId == userId && ids.Contains(m.WordId))
                .ToListAsync())
            .ToDictionary(m => m.WordId, m => m.Mastery);
        var examples = (await db.Queryable<WordExample>()
                .Where(e => ids.Contains(e.WordId))
                .OrderBy(e => e.Id)
                .ToListAsync())
            .GroupBy(e => e.WordId)
            .ToDictionary(g => g.Key, g => g.First().Sentence);

        var rows = words.Select(w => new DictEntryDto(
                w.Id, w.Text, w.Phonetic ?? "", w.Pos ?? "", w.Zh ?? "", w.Topic ?? "",
                examples.GetValueOrDefault(w.Id, ""), mastery.GetValueOrDefault(w.Id)))
            .ToList();
        return (rows, total.Value);
    }

    /// <summary>The headers, the first <see cref="SampleRows"/> data rows and the format of an import file.</summary>
    public async Task<ImportPreviewDto> PreviewAsync(Stream stream, string? fileName, CancellationToken ct = default)
    {
        var (format, options) = WordFile.OptionsFor(fileName, stream);
        List<string>? headers = null;
        var sample = new List<List<string>>();
        await foreach (var row in WordFile.ReadAsync(importer, stream, options, ct))
        {
            headers ??= row.Values.Keys.ToList();
            sample.Add(headers.Select(h => WordFile.Text(row.Values.GetValueOrDefault(h))).ToList());
            if (sample.Count == SampleRows)
            {
                break;
            }
        }

        headers ??= await WordFile.HeadersOnlyAsync(importer, stream, options, ct);
        return new ImportPreviewDto(headers, sample, format);
    }

    /// <summary>
    /// Imports every data row of a file, reading each field from the header <paramref name="map"/>
    /// names. All or nothing: a row whose word is blank fails the whole file with the data-row
    /// numbers of such rows, and nothing is written. Rows are read one at a time and stored in
    /// batches inside one transaction.
    /// </summary>
    public async Task<ImportWordsResult> ImportFileAsync(
        Stream stream, string? fileName, WordImportMap map, bool skipDuplicates, CancellationToken ct = default)
    {
        var (_, options) = WordFile.OptionsFor(fileName, stream);
        if (string.IsNullOrWhiteSpace(map.Word))
        {
            throw new LibraryException(400, "Pick the column that holds the word.");
        }

        var columns = new[] { map.Word, map.Zh, map.Phonetic, map.Pos, map.Topic, map.Example }
            .Select(Header).OfType<string>().Distinct().ToList();

        var added = 0;
        var skipped = 0;
        await InTransactionAsync(async () =>
        {
            added = 0;
            skipped = 0;
            var seen = await ExistingKeysAsync();
            var lastId = await LastWordIdAsync();
            var batch = new List<(Word Word, string? Example)>(InsertBatch);
            var failed = new List<string>();
            var failedCount = 0;
            var checkedColumns = false;

            await foreach (var row in WordFile.ReadAsync(importer, stream, options, ct))
            {
                if (!checkedColumns)
                {
                    CheckColumns(columns, row.Values.Keys);
                    checkedColumns = true;
                }

                string? Cell(string? header) =>
                    Header(header) is { } h ? Clean(WordFile.Text(row.Values.GetValueOrDefault(h))) : null;

                var text = Cell(map.Word);
                if (text is null)
                {
                    failedCount++;
                    if (failed.Count < MaxFailedReported)
                    {
                        failed.Add(WordFile.DataRowNumber(row, options).ToString());
                    }

                    continue;
                }

                if (failedCount > 0)
                {
                    // The file is rejected already; the rest is read only to count the blank rows.
                    continue;
                }

                var topic = Cell(map.Topic) ?? DefaultTopic;
                if (!seen.Add(Key(text, topic)) && skipDuplicates)
                {
                    skipped++;
                    continue;
                }

                batch.Add((new Word
                {
                    Text = text,
                    Phonetic = Cell(map.Phonetic),
                    Pos = Cell(map.Pos),
                    Zh = Cell(map.Zh),
                    Topic = topic,
                }, Cell(map.Example)));
                if (batch.Count == InsertBatch)
                {
                    lastId = await InsertBatchAsync(batch, lastId);
                    added += batch.Count;
                    batch.Clear();
                }
            }

            if (!checkedColumns)
            {
                CheckColumns(columns, await WordFile.HeadersOnlyAsync(importer, stream, options, ct));
            }

            if (failedCount > 0)
            {
                throw new LibraryException(400, "Some rows have no word.", failed, failedCount);
            }

            if (batch.Count > 0)
            {
                await InsertBatchAsync(batch, lastId);
                added += batch.Count;
            }
        });

        return new ImportWordsResult(added, skipped);
    }

    private static string? Header(string? name) => string.IsNullOrWhiteSpace(name) ? null : name.Trim();

    private static void CheckColumns(IEnumerable<string> wanted, IEnumerable<string> headers)
    {
        var present = headers.ToHashSet();
        var missing = wanted.Where(w => !present.Contains(w)).ToList();
        if (missing.Count > 0)
        {
            throw new LibraryException(400, "The file has no column named " + string.Join(", ", missing) + ".");
        }
    }

    /// <summary>
    /// Stores one batch of words and then their examples. The new ids are read back as the rows
    /// above <paramref name="lastId"/>: the transaction is the only writer, so they are exactly
    /// this batch, in order. Returns the highest id now stored.
    /// </summary>
    private async Task<int> InsertBatchAsync(List<(Word Word, string? Example)> batch, int lastId)
    {
        await db.Insertable(batch.Select(b => b.Word).ToList()).ExecuteCommandAsync();
        var ids = await db.Queryable<Word>()
            .Where(w => w.Id > lastId)
            .OrderBy(w => w.Id)
            .Select(w => w.Id)
            .ToListAsync();
        if (ids.Count != batch.Count)
        {
            throw new InvalidOperationException($"Expected {batch.Count} new words, found {ids.Count}.");
        }

        var examples = batch.Zip(ids)
            .Where(x => x.First.Example is not null)
            .Select(x => new WordExample { WordId = x.Second, Sentence = x.First.Example! })
            .ToList();
        if (examples.Count > 0)
        {
            await db.Insertable(examples).ExecuteCommandAsync();
        }

        return ids[^1];
    }

    private async Task<int> LastWordIdAsync() =>
        await db.Queryable<Word>().AnyAsync() ? await db.Queryable<Word>().MaxAsync(w => w.Id) : 0;

    private static string Key(string text, string? topic) =>
        text.ToLowerInvariant() + "\u001F" + (topic ?? "");

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>Every (Text, Topic) key already stored, read as two columns in one pass.</summary>
    private async Task<HashSet<string>> ExistingKeysAsync()
    {
        var rows = await db.Queryable<Word>().Select(w => new { w.Text, w.Topic }).ToListAsync();
        return rows.Select(w => Key(w.Text, w.Topic)).ToHashSet();
    }

    private async Task InTransactionAsync(Func<Task> work)
    {
        var result = await db.Ado.UseTranAsync(work);
        if (!result.IsSuccess)
        {
            throw result.ErrorException ?? new InvalidOperationException(result.ErrorMessage);
        }
    }
}
