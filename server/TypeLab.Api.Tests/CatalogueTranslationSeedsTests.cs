using SqlSugar;
using TypeLab.Api.Data;
using TypeLab.Api.Models;

namespace TypeLab.Api.Tests;

public class CatalogueTranslationSeedsTests
{
    private static void SeedAll(ISqlSugarClient db)
    {
        PromptSeeds.Seed(db);
        ModelSeeds.Seed(db);
        CatalogueTranslationSeeds.Seed(db);
    }

    [Fact]
    public void Seeds_traditional_and_simplified_names_for_built_in_prompts()
    {
        using var db = new TestDb();
        SeedAll(db.Db);

        var categorise = db.Db.Queryable<PromptTemplate>().First(p => p.Code == "categorise");
        var zhTw = NameOf(db, categorise.Id, "zh-TW");
        var zhCn = NameOf(db, categorise.Id, "zh-CN");

        Assert.Equal("分類", zhTw);
        Assert.Equal("分类", zhCn);
    }

    [Fact]
    public void Seeds_model_notes_without_renaming_the_catalogue_code()
    {
        using var db = new TestDb();
        SeedAll(db.Db);

        var jieba = db.Db.Queryable<LocalModelEntry>().First(m => m.Code == "jieba-zh-tw");

        Assert.Equal("jieba-zh-tw", jieba.Name);
        Assert.Equal("繁體中文分詞", NoteOf(db, jieba.Id, "zh-TW"));
        Assert.Equal("繁体中文分词", NoteOf(db, jieba.Id, "zh-CN"));
    }

    [Fact]
    public void Reseed_overwrites_built_in_copy_that_drifted_in_the_database()
    {
        using var db = new TestDb();
        SeedAll(db.Db);

        var categorise = db.Db.Queryable<PromptTemplate>().First(p => p.Code == "categorise");
        var row = db.Db.Queryable<Translation>().First(t =>
            t.EntityType == "PromptTemplates" && t.EntityId == categorise.Id
            && t.Field == "Name" && t.Locale == "zh-TW");
        row.Value = "被改過";
        db.Db.Updateable(row).ExecuteCommand();

        CatalogueTranslationSeeds.Seed(db.Db);

        Assert.Equal("分類", NameOf(db, categorise.Id, "zh-TW"));
    }

    [Fact]
    public void Does_not_write_translations_for_a_user_owned_prompt()
    {
        using var db = new TestDb();
        SeedAll(db.Db);

        var userRow = new PromptTemplate
        {
            Code = "categorise",
            Name = "My categorise",
            Description = "user copy",
            Content = "do it my way",
            Revision = 1,
            IsBuiltIn = false,
            CreatedBy = 7,
            UpdatedAt = DateTime.UtcNow,
        };
        db.Db.Insertable(userRow).ExecuteCommand();
        var inserted = db.Db.Queryable<PromptTemplate>()
            .First(p => p.Code == "categorise" && p.CreatedBy == 7);

        db.Db.Insertable(new Translation
        {
            EntityType = "PromptTemplates",
            EntityId = inserted.Id,
            Field = "Name",
            Locale = "zh-TW",
            Value = "我的分類",
            UpdatedAt = DateTime.UtcNow,
        }).ExecuteCommand();

        CatalogueTranslationSeeds.Seed(db.Db);

        var userTranslation = db.Db.Queryable<Translation>().First(t =>
            t.EntityType == "PromptTemplates" && t.EntityId == inserted.Id
            && t.Field == "Name" && t.Locale == "zh-TW");
        Assert.Equal("我的分類", userTranslation.Value);

        var builtInCount = db.Db.Queryable<PromptTemplate>().Count(p => p.Code == "categorise" && p.IsBuiltIn);
        Assert.Equal(1, builtInCount);
    }

    private static string NameOf(TestDb db, int promptId, string locale) =>
        db.Db.Queryable<Translation>().First(t =>
            t.EntityType == "PromptTemplates" && t.EntityId == promptId
            && t.Field == "Name" && t.Locale == locale).Value;

    private static string NoteOf(TestDb db, int modelId, string locale) =>
        db.Db.Queryable<Translation>().First(t =>
            t.EntityType == "LocalModels" && t.EntityId == modelId
            && t.Field == "Note" && t.Locale == locale).Value;
}
