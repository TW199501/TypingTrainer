using SqlSugar;
using TypeLab.Api.Models;

namespace TypeLab.Api.Data;

/// <summary>
/// The fixed catalogue offered on the Models page, seeded from what the front
/// end used to hard-code in <c>apps/src/stores/ai.ts</c>.
///
/// SourceUrl is left null: the download endpoints have not been settled yet, and
/// a wrong URL here would be worse than an empty one. Fill them in when the
/// hosting is decided — the column and the seeding path are already in place.
/// </summary>
public static class ModelSeeds
{
    public static readonly LocalModelEntry[] All =
    [
        new()
        {
            Code = "jieba-zh-tw",
            Name = "jieba-zh-tw",
            Kind = "Token",
            Note = "Traditional Chinese segmentation",
            SizeMb = 42,
            SortOrder = 1,
            Installed = true,
        },
        new()
        {
            Code = "bge-m3",
            Name = "bge-m3",
            Kind = "Embed",
            Note = "Multilingual vectors for semantic search",
            SizeMb = 2200,
            SortOrder = 2,
            Installed = true,
        },
        new()
        {
            Code = "text2vec-base-chinese",
            Name = "text2vec-base-chinese",
            Kind = "Embed",
            Note = "Lightweight Chinese vectors",
            SizeMb = 410,
            SortOrder = 3,
            Installed = false,
        },
        new()
        {
            Code = "bge-reranker-v2-m3",
            Name = "bge-reranker-v2-m3",
            Kind = "Rerank",
            Note = "High-precision result reranking",
            SizeMb = 1100,
            SortOrder = 4,
            Installed = false,
        },
        new()
        {
            Code = "jina-reranker-v2-tiny",
            Name = "jina-reranker-v2-tiny",
            Kind = "Rerank",
            Note = "Lightweight rerank, realtime on desktop",
            SizeMb = 280,
            SortOrder = 5,
            Installed = false,
        },
    ];

    /// <summary>
    /// Inserts catalogue entries that are missing and refreshes the descriptive
    /// columns of the ones already there. <see cref="LocalModelEntry.Installed"/>
    /// and <see cref="LocalModelEntry.InstalledAt"/> are runtime state and are
    /// never reset by seeding — re-seeding must not uninstall a model.
    /// </summary>
    public static void Seed(ISqlSugarClient db)
    {
        var existing = db.Queryable<LocalModelEntry>().ToList().ToDictionary(m => m.Code, m => m);

        foreach (var seed in All)
        {
            if (!existing.TryGetValue(seed.Code, out var row))
            {
                db.Insertable(seed).ExecuteCommand();
                continue;
            }

            row.Name = seed.Name;
            row.Kind = seed.Kind;
            row.Note = seed.Note;
            row.SizeMb = seed.SizeMb;
            row.SourceUrl = seed.SourceUrl;
            row.Sha256 = seed.Sha256;
            row.SortOrder = seed.SortOrder;
            db.Updateable(row).ExecuteCommand();
        }
    }
}
