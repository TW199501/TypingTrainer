using SqlSugar;
using TypeLab.Api.Models;

namespace TypeLab.Api.Data;

/// <summary>
/// The categories the app ships with, copied from the front-end fixtures so the
/// real API and the mock agree. Matching is on <see cref="Category.Code"/>;
/// rows with a null Code belong to the user and are never touched.
/// </summary>
public static class CategorySeeds
{
    public const string UncategorisedCode = "custom";
    public const string UncategorisedSubCode = "custom/uncategorised";

    private sealed record Top(string Code, string Name, string Color, string Layout, string[] Subs);

    private static readonly Top[] Tops =
    [
        new("basic", "Basics", "#8a9a5b", "en", ["Home row", "Top row", "Bottom row", "Numbers", "Symbols"]),
        new("english", "English", "#d97757", "en",
            ["Web", "Banking", "Support email", "Business email", "Tech news", "Literature"]),
        new("chinese", "Chinese", "#b06a4f", "zh",
            ["Finance", "Accounting", "News", "Official", "Literature", "Daily talk"]),
        new("zhuyin", "Bopomofo", "#a8763e", "zhuyin", ["Initials", "Finals", "Tones", "Mixed"]),
        new("bilingual", "Vocabulary", "#6f8f85", "zh",
            ["Banking", "Accounting", "IT", "Meetings", "Daily life"]),
        new("code", "Code", "#7d8c5c", "en", ["C#", "JavaScript", "SQL"]),
        new("timed", "Timed", "#c08552", "en", ["1 min", "3 min", "5 min"]),
        new(UncategorisedCode, "Uncategorised", "#8b877e", "en", ["Uncategorised"]),
    ];

    /// <summary>The code of the sub-category <paramref name="name"/> under <paramref name="parentCode"/>.</summary>
    public static string SubCode(string parentCode, string name) =>
        parentCode + "/" + name.ToLowerInvariant().Replace(' ', '-');

    /// <summary>The code of the first sub-category of the top-level category <paramref name="topCode"/>.</summary>
    public static string FirstSubCode(string topCode)
    {
        var top = Tops.First(t => t.Code == topCode);
        return SubCode(top.Code, top.Subs[0]);
    }

    /// <summary>Inserts missing built-in rows and restores shipped values that drifted.</summary>
    public static void Seed(ISqlSugarClient db)
    {
        var existing = db.Queryable<Category>()
            .Where(c => c.Code != null)
            .ToList()
            .ToDictionary(c => c.Code!, c => c);

        var order = 0;
        foreach (var top in Tops)
        {
            var parent = Upsert(db, existing, top.Code, null, top.Name, top, order++);
            var subOrder = 0;
            foreach (var name in top.Subs)
            {
                Upsert(db, existing, SubCode(top.Code, name), parent.Id, name, top, subOrder++);
            }
        }
    }

    private static Category Upsert(
        ISqlSugarClient db, Dictionary<string, Category> existing, string code, int? parentId,
        string name, Top top, int sortOrder)
    {
        if (!existing.TryGetValue(code, out var row))
        {
            row = new Category
            {
                Code = code, ParentId = parentId, Name = name, Color = top.Color,
                Layout = top.Layout, Kind = top.Code, SortOrder = sortOrder,
            };
            row.Id = db.Insertable(row).ExecuteReturnIdentity();
            existing[code] = row;
            return row;
        }

        if (row.ParentId == parentId && row.Name == name && row.Color == top.Color
            && row.Layout == top.Layout && row.Kind == top.Code && row.SortOrder == sortOrder)
        {
            return row;
        }

        row.ParentId = parentId;
        row.Name = name;
        row.Color = top.Color;
        row.Layout = top.Layout;
        row.Kind = top.Code;
        row.SortOrder = sortOrder;
        db.Updateable(row).ExecuteCommand();
        return row;
    }
}
