using Microsoft.AspNetCore.Http.HttpResults;
using TypeLab.Api.Api;
using TypeLab.Api.Data;
using TypeLab.Api.Models;

namespace TypeLab.Api.Tests;

public class TextContentTests
{
    private static TestDb NewDb()
    {
        var t = new TestDb(
            typeof(Category), typeof(PracticeText), typeof(TextSegmentation), typeof(TextSegment), typeof(User));
        CategorySeeds.Seed(t.Db);
        TextSeeds.Seed(t.Db);
        return t;
    }

    [Theory]
    [InlineData("one\r\ntwo\rthree", "one\ntwo\nthree")]
    [InlineData("a\tb\t\tc", "a b  c")]
    [InlineData("line one   \nline two\t \n", "line one\nline two")]
    [InlineData("\n\n  \r\n  indented\n\nnext\n \n\n", "  indented\n\nnext")]
    [InlineData("第一段。　\r\n第二段。", "第一段。\n第二段。")]
    [InlineData("already clean", "already clean")]
    public void Normalise_makes_every_character_typable(string raw, string expected)
    {
        Assert.Equal(expected, TextContent.Normalise(raw));
    }

    [Fact]
    public void Normalise_is_idempotent()
    {
        const string raw = "\r\n a\t\r\n\r\nb  \r\n\r\n";
        var once = TextContent.Normalise(raw);

        Assert.Equal(once, TextContent.Normalise(once));
    }

    [Fact]
    public async Task Create_stores_normalised_content_and_its_length()
    {
        using var t = NewDb();
        var lib = new LibraryService(t.Db);

        var text = await lib.CreateTextAsync(new("Mine", "Dear team,\r\n\tthanks   \r\n\r\n", null, null, null, null));

        var full = await lib.GetTextAsync(text.Id);
        Assert.Equal("Dear team,\n thanks", full!.Content);
        Assert.Equal(full.Content!.Length, full.Chars);
    }

    [Fact]
    public async Task Import_stores_normalised_content()
    {
        using var t = NewDb();
        var lib = new LibraryService(t.Db);

        var saved = await lib.ImportTextsAsync(new([new("a", "x\ty\r\n", null, null, null, "a.txt")]));

        var full = await lib.GetTextAsync(saved[0].Id);
        Assert.Equal("x y", full!.Content);
        Assert.Equal(3, saved[0].Chars);
    }

    [Fact]
    public void Built_in_seeds_are_already_normalised()
    {
        using var t = NewDb();

        foreach (var row in t.Db.Queryable<PracticeText>().Where(x => x.Code != null).ToList())
        {
            Assert.Equal(TextContent.Normalise(row.Content), row.Content);
        }
    }

    [Fact]
    public void Stored_user_texts_are_normalised_once_and_a_second_run_changes_nothing()
    {
        using var t = NewDb();
        var sub = t.Db.Queryable<Category>().First(c => c.Code == CategorySeeds.UncategorisedSubCode);
        var dirty = t.Db.Insertable(new PracticeText
        {
            CategoryId = sub.Id, Title = "old", Content = "first\r\n\tsecond  \r\n", Level = 3, Chars = 19,
            Language = "en", CreatedAt = DateTime.UtcNow,
        }).ExecuteReturnIdentity();
        var clean = t.Db.Insertable(new PracticeText
        {
            CategoryId = sub.Id, Title = "clean", Content = "fine", Level = 3, Chars = 4,
            Language = "en", CreatedAt = DateTime.UtcNow,
        }).ExecuteReturnIdentity();
        var builtIn = t.Db.Queryable<PracticeText>().Where(x => x.Code != null).ToList()
            .ToDictionary(x => x.Id, x => x.Content);

        Assert.Equal(1, TextContent.NormaliseStored(t.Db));

        var row = t.Db.Queryable<PracticeText>().First(x => x.Id == dirty);
        Assert.Equal("first\n second", row.Content);
        Assert.Equal(13, row.Chars);
        Assert.Equal("fine", t.Db.Queryable<PracticeText>().First(x => x.Id == clean).Content);
        Assert.Equal(17, t.Db.Queryable<PracticeText>().Count());
        Assert.All(t.Db.Queryable<PracticeText>().Where(x => x.Code != null).ToList(),
            x => Assert.Equal(builtIn[x.Id], x.Content));

        Assert.Equal(0, TextContent.NormaliseStored(t.Db));
        Assert.Equal("first\n second", t.Db.Queryable<PracticeText>().First(x => x.Id == dirty).Content);
    }

    [Fact]
    public async Task Missing_text_is_a_problem_details_404()
    {
        using var t = NewDb();

        var result = await LibraryEndpoints.GetTextAsync(new LibraryService(t.Db), 99999);

        var problem = Assert.IsType<ProblemHttpResult>(result);
        Assert.Equal(404, problem.StatusCode);
    }
}
