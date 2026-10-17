using SqlSugar;
using TypeLab.Api.Api;
using TypeLab.Api.Models;

namespace TypeLab.Api.Data;

/// <summary>Reads the dictionary with the local user's mastery, and imports new words into it.</summary>
public class DictionaryService(ISqlSugarClient db)
{
    private const string DefaultTopic = "Uncategorised";
    private const int LookupChunk = 500;

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

    public async Task<ImportWordsResult> ImportAsync(ImportWordsRequest request)
    {
        var rows = request.Words ?? [];
        var failed = new List<string>();
        for (var i = 0; i < rows.Count; i++)
        {
            if (string.IsNullOrWhiteSpace(rows[i].Word))
            {
                failed.Add((i + 1).ToString());
            }
        }

        if (failed.Count > 0)
        {
            throw new LibraryException(400, "Some rows have no word.", failed);
        }

        var added = 0;
        var skipped = 0;
        await InTransactionAsync(async () =>
        {
            added = 0;
            skipped = 0;
            var seen = await ExistingKeysAsync(rows);
            foreach (var row in rows)
            {
                var text = row.Word.Trim();
                var topic = string.IsNullOrWhiteSpace(row.Topic) ? DefaultTopic : row.Topic.Trim();
                if (!seen.Add(Key(text, topic)) && request.SkipDuplicates)
                {
                    skipped++;
                    continue;
                }

                var id = await db.Insertable(new Word
                {
                    Text = text,
                    Phonetic = Clean(row.Phonetic),
                    Pos = Clean(row.Pos),
                    Zh = Clean(row.Zh),
                    Topic = topic,
                }).ExecuteReturnIdentityAsync();
                if (!string.IsNullOrWhiteSpace(row.Example))
                {
                    await db.Insertable(new WordExample { WordId = id, Sentence = row.Example.Trim() })
                        .ExecuteCommandAsync();
                }

                added++;
            }
        });

        return new ImportWordsResult(added, skipped);
    }

    private static string Key(string text, string? topic) =>
        text.ToLowerInvariant() + "\u001F" + (topic ?? "");

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>The (Text, Topic) keys already stored for any word the batch mentions.</summary>
    private async Task<HashSet<string>> ExistingKeysAsync(List<ImportWordRow> rows)
    {
        var lowered = rows.Select(r => r.Word.Trim().ToLowerInvariant()).Distinct().ToList();
        var keys = new HashSet<string>();
        foreach (var chunk in lowered.Chunk(LookupChunk))
        {
            var part = chunk.ToList();
            var found = await db.Queryable<Word>().Where(w => part.Contains(w.Text.ToLower())).ToListAsync();
            foreach (var w in found)
            {
                keys.Add(Key(w.Text, w.Topic));
            }
        }

        return keys;
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
