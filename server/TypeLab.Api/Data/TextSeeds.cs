using System.Text.RegularExpressions;
using SqlSugar;
using TypeLab.Api.Models;

namespace TypeLab.Api.Data;

/// <summary>
/// The practice texts the app ships with, copied from <c>TEXTS</c> in
/// <c>apps/src/data/constants.ts</c>. Must run after <see cref="CategorySeeds"/>:
/// each text is filed under the first sub-category of its kind.
/// </summary>
public static partial class TextSeeds
{
    private sealed record Group(string Kind, int Level, string Language, string[] Items);

    private static readonly Group[] Groups =
    [
        new("basic", 1, "en",
        [
            "asdf jkl; asdf jkl; fjdk slas dkfj gh",
            "the quick fox jumps over a lazy dog by the river",
            "sad lads ask dad; fall glass half gaff jail",
        ]),
        new("english", 3, "en",
        [
            "Design is not just what it looks like and feels like. Design is how it works. A good interface disappears into the task, leaving the person free to think about the work itself.",
            "Typing well is a quiet skill. It rewards patience over speed, accuracy over bursts, and steady daily practice over a single long session.",
        ]),
        new("chinese", 3, "zh",
        [
            "打字練習的重點不在速度，而在穩定。每天固定練十分鐘，手指會自己記住位置，速度自然跟上來。",
            "好的介面會消失在任務裡，讓人專心想事情本身，而不是想著手上的工具怎麼操作。",
        ]),
        new("zhuyin", 2, "zh",
        [
            "ㄅㄆㄇㄈ ㄉㄊㄋㄌ ㄍㄎㄏ ㄐㄑㄒ",
            "ㄓㄔㄕㄖ ㄗㄘㄙ ㄧㄨㄩ ㄚㄛㄜㄝ",
            "ㄞㄟㄠㄡ ㄢㄣㄤㄥ ㄦ ˊˇˋ˙",
        ]),
        new("code", 5, "en",
        [
            "const wpm = (chars, ms) => Math.round((chars / 5) / (ms / 60000));",
            "if (typed[i] !== target[i]) { errors.set(target[i], (errors.get(target[i]) ?? 0) + 1); }",
            "SELECT UserId, AVG(WPM) FROM Sessions WHERE CreatedAt > @start GROUP BY UserId;",
        ]),
        new("timed", 3, "en",
        [
            "A calm mind types faster than a rushed one. Focus on the next character, not the whole paragraph, and the speed will follow on its own.",
        ]),
        new(CategorySeeds.UncategorisedCode, 2, "en",
        [
            "Paste your own paragraph here to practise exactly the words you write every day at work.",
        ]),
    ];

    [GeneratedRegex(@"\s+")]
    private static partial Regex Whitespace();

    /// <summary>Whitespace collapsed, first 18 characters, with an ellipsis when cut.</summary>
    private static string TitleOf(string content)
    {
        var flat = Whitespace().Replace(content, " ").Trim();
        return flat.Length > 18 ? flat[..18] + "…" : flat;
    }

    /// <summary>Inserts missing built-in texts and refreshes ones whose shipped copy changed.</summary>
    public static void Seed(ISqlSugarClient db)
    {
        var existing = db.Queryable<PracticeText>()
            .Where(t => t.Code != null)
            .ToList()
            .ToDictionary(t => t.Code!, t => t);
        var categories = db.Queryable<Category>()
            .Where(c => c.Code != null)
            .ToList()
            .ToDictionary(c => c.Code!, c => c.Id);

        var order = 0;
        foreach (var group in Groups)
        {
            var subCode = group.Kind == CategorySeeds.UncategorisedCode
                ? CategorySeeds.UncategorisedSubCode
                : CategorySeeds.FirstSubCode(group.Kind);
            var categoryId = categories[subCode];

            for (var i = 0; i < group.Items.Length; i++)
            {
                var content = group.Items[i];
                var code = $"{group.Kind}.{i + 1}";
                var seed = new PracticeText
                {
                    Code = code,
                    CategoryId = categoryId,
                    SortOrder = order++,
                    Title = TitleOf(content),
                    Content = content,
                    Level = group.Level,
                    Chars = content.Length,
                    Language = group.Language,
                    CreatedBy = null,
                };

                if (!existing.TryGetValue(code, out var row))
                {
                    db.Insertable(seed).ExecuteCommand();
                    continue;
                }

                if (row.CategoryId == seed.CategoryId && row.SortOrder == seed.SortOrder
                    && row.Title == seed.Title && row.Content == seed.Content
                    && row.Level == seed.Level && row.Chars == seed.Chars
                    && row.Language == seed.Language)
                {
                    continue;
                }

                row.CategoryId = seed.CategoryId;
                row.SortOrder = seed.SortOrder;
                row.Title = seed.Title;
                row.Content = seed.Content;
                row.Level = seed.Level;
                row.Chars = seed.Chars;
                row.Language = seed.Language;
                db.Updateable(row).ExecuteCommand();
            }
        }
    }
}
