using SqlSugar;
using TypeLab.Api.Models;

namespace TypeLab.Api.Data;

/// <summary>
/// zh-TW / zh-CN (and a matching English row) for the shipped catalogue.
/// English display copy lives on the entity; this table holds every UI locale
/// so <c>GET /models</c> and <c>GET /prompts</c> can resolve without the
/// front-end bundle. User-owned rows are never written here.
/// </summary>
public static class CatalogueTranslationSeeds
{
    public const string PromptEntity = "PromptTemplates";
    public const string ModelEntity = "LocalModels";

    public readonly record struct LocalizedText(string ZhTw, string ZhCn);

    public static readonly Dictionary<string, (LocalizedText Name, LocalizedText Description)> Prompts = new()
    {
        ["categorise"] = (
            new("分類", "分类"),
            new("將貼上或匯入的文本歸入大類、細項與難度。", "将粘贴或导入的文本归入大类、细项与难度。")),
        ["examples"] = (
            new("例句", "例句"),
            new("為字典詞彙產生一句實用例句。", "为词典词条生成一句实用例句。")),
        ["rewrite"] = (
            new("改寫", "改写"),
            new("把最常打錯的鍵自然織進文本，供針對練習。", "把最常打错的键自然织进文本，供针对练习。")),
        ["level"] = (
            new("難度", "难度"),
            new("評定打字難度（L1–L6）。", "评定打字难度（L1–L6）。")),
        ["segment.zh"] = (
            new("中文分詞", "中文分词"),
            new("把中文練習文本切成一次打完的單位，並標詞性與注音。", "把中文练习文本切成一次打完的单位，并标词性与拼音。")),
    };

    public static readonly Dictionary<string, LocalizedText> ModelNotes = new()
    {
        ["jieba-zh-tw"] = new("繁體中文分詞", "繁体中文分词"),
        ["bge-m3"] = new("多語語意搜尋向量", "多语语义搜索向量"),
        ["text2vec-base-chinese"] = new("輕量中文向量", "轻量中文向量"),
        ["bge-reranker-v2-m3"] = new("高精度結果重排序", "高精度结果重排序"),
        ["jina-reranker-v2-tiny"] = new("輕量重排序，桌面即時可用", "轻量重排序，桌面实时可用"),
    };

    public static void Seed(ISqlSugarClient db)
    {
        SeedPrompts(db);
        SeedModels(db);
    }

    private static void SeedPrompts(ISqlSugarClient db)
    {
        var rows = db.Queryable<PromptTemplate>().Where(p => p.IsBuiltIn).ToList();
        foreach (var row in rows)
        {
            if (!Prompts.TryGetValue(row.Code, out var copy)) continue;

            Upsert(db, PromptEntity, row.Id, "Name", "en", row.Name);
            Upsert(db, PromptEntity, row.Id, "Name", "zh-TW", copy.Name.ZhTw);
            Upsert(db, PromptEntity, row.Id, "Name", "zh-CN", copy.Name.ZhCn);

            var description = row.Description ?? string.Empty;
            Upsert(db, PromptEntity, row.Id, "Description", "en", description);
            Upsert(db, PromptEntity, row.Id, "Description", "zh-TW", copy.Description.ZhTw);
            Upsert(db, PromptEntity, row.Id, "Description", "zh-CN", copy.Description.ZhCn);
        }
    }

    private static void SeedModels(ISqlSugarClient db)
    {
        var rows = db.Queryable<LocalModelEntry>().ToList();
        foreach (var row in rows)
        {
            if (!ModelNotes.TryGetValue(row.Code, out var note)) continue;

            Upsert(db, ModelEntity, row.Id, "Note", "en", row.Note);
            Upsert(db, ModelEntity, row.Id, "Note", "zh-TW", note.ZhTw);
            Upsert(db, ModelEntity, row.Id, "Note", "zh-CN", note.ZhCn);
        }
    }

    private static void Upsert(
        ISqlSugarClient db,
        string entityType,
        int entityId,
        string field,
        string locale,
        string value)
    {
        var row = db.Queryable<Translation>().First(t =>
            t.EntityType == entityType && t.EntityId == entityId
            && t.Field == field && t.Locale == locale);

        if (row is null)
        {
            db.Insertable(new Translation
            {
                EntityType = entityType,
                EntityId = entityId,
                Field = field,
                Locale = locale,
                Value = value,
                UpdatedAt = DateTime.UtcNow,
            }).ExecuteCommand();
            return;
        }

        if (row.Value == value) return;

        row.Value = value;
        row.UpdatedAt = DateTime.UtcNow;
        db.Updateable(row).ExecuteCommand();
    }
}
