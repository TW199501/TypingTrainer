using SqlSugar;
using TypeLab.Api.Data;
using TypeLab.Api.Models;


namespace TypeLab.Api.Tests;

public class CatalogueLocalizerTests
{
    [Theory]
    [InlineData("zh-TW", null, "zh-TW")]
    [InlineData("zh-CN", null, "zh-CN")]
    [InlineData("en", null, "en")]
    [InlineData(null, "zh-TW,zh;q=0.9,en;q=0.8", "zh-TW")]
    [InlineData(null, "zh-Hans-CN,zh;q=0.8", "zh-CN")]
    [InlineData(null, "zh-Hant,en;q=0.5", "zh-TW")]
    [InlineData("fr", "en-US,en;q=0.9", "en")]
    [InlineData(null, null, "en")]
    [InlineData("ZH-tw", null, "zh-TW")]
    public void ResolveLocale_prefers_the_query_then_accept_language(string? query, string? header, string expected)
    {
        Assert.Equal(expected, CatalogueLocalizer.ResolveLocale(query, header));
    }

    /// <summary>
    /// RFC 9110 orders by the q parameter, not by position. Browsers usually
    /// send the preferred tag first, so the cases above pass either way; a
    /// client that does not would have been given the wrong language.
    /// </summary>
    [Theory]
    [InlineData("en;q=0.2,zh-TW;q=0.9", "zh-TW")]
    [InlineData("zh-CN;q=0.1,en;q=0.8", "en")]
    [InlineData("zh-TW;q=0.4,zh-CN;q=0.6", "zh-CN")]
    // No q means 1.0, which outranks anything explicitly lower.
    [InlineData("zh-CN;q=0.5,en", "en")]
    // q=0 means "not acceptable" and must never be selected.
    [InlineData("zh-TW;q=0,en;q=0.3", "en")]
    // Equal quality keeps the order they were listed in.
    [InlineData("zh-TW;q=0.5,zh-CN;q=0.5", "zh-TW")]
    public void ResolveLocale_honours_q_values(string header, string expected)
    {
        Assert.Equal(expected, CatalogueLocalizer.ResolveLocale(null, header));
    }

    [Fact]
    public void Pick_uses_the_requested_locale_then_english_then_the_base_column()
    {
        using var db = new TestDb();
        PromptSeeds.Seed(db.Db);
        ModelSeeds.Seed(db.Db);
        CatalogueTranslationSeeds.Seed(db.Db);

        var jieba = db.Db.Queryable<LocalModelEntry>().First(m => m.Code == "jieba-zh-tw");
        var mapTw = CatalogueLocalizer.Load(db.Db, "LocalModels", [jieba.Id], "zh-TW");
        var mapMissing = CatalogueLocalizer.Load(db.Db, "LocalModels", [jieba.Id], "fr");

        Assert.Equal("繁體中文分詞", CatalogueLocalizer.Pick(mapTw, jieba.Id, "Note", jieba.Note));
        Assert.Equal(jieba.Note, CatalogueLocalizer.Pick(mapMissing, jieba.Id, "Note", jieba.Note));
    }

    [Fact]
    public void Pick_falls_back_to_the_base_column_when_the_locale_row_is_missing()
    {
        using var db = new TestDb();
        PromptSeeds.Seed(db.Db);
        var categorise = db.Db.Queryable<PromptTemplate>().First(p => p.Code == "categorise");

        var map = CatalogueLocalizer.Load(db.Db, "PromptTemplates", [categorise.Id], "zh-TW");

        Assert.Equal(categorise.Name, CatalogueLocalizer.Pick(map, categorise.Id, "Name", categorise.Name));
    }
}
