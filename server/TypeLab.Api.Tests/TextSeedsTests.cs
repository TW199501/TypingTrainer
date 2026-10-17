using TypeLab.Api.Data;
using TypeLab.Api.Models;

namespace TypeLab.Api.Tests;

public class TextSeedsTests
{
    private static TestDb NewDb()
    {
        var t = new TestDb(typeof(Category), typeof(PracticeText));
        CategorySeeds.Seed(t.Db);
        return t;
    }

    [Fact]
    public void Seed_twice_keeps_15_texts()
    {
        using var t = NewDb();
        TextSeeds.Seed(t.Db);
        TextSeeds.Seed(t.Db);

        Assert.Equal(15, t.Db.Queryable<PracticeText>().Count());
    }

    [Fact]
    public void Every_seeded_text_points_at_a_sub()
    {
        using var t = NewDb();
        TextSeeds.Seed(t.Db);

        var cats = t.Db.Queryable<Category>().ToList().ToDictionary(c => c.Id);
        foreach (var text in t.Db.Queryable<PracticeText>().ToList())
        {
            Assert.NotNull(text.Code);
            Assert.NotNull(cats[text.CategoryId].ParentId);
        }
    }

    [Fact]
    public void Chinese_text_is_copied_verbatim()
    {
        using var t = NewDb();
        TextSeeds.Seed(t.Db);

        var text = t.Db.Queryable<PracticeText>().First(x => x.Code == "chinese.1");
        const string content = "打字練習的重點不在速度，而在穩定。每天固定練十分鐘，手指會自己記住位置，速度自然跟上來。";
        Assert.Equal(content, text.Content);
        Assert.Equal(content.Length, text.Chars);
        Assert.Equal("打字練習的重點不在速度，而在穩定。每…", text.Title);
        Assert.Equal(3, text.Level);
        Assert.Equal("zh", text.Language);
        Assert.Equal(5, text.SortOrder);
    }

    [Fact]
    public void Custom_text_goes_to_uncategorised()
    {
        using var t = NewDb();
        TextSeeds.Seed(t.Db);

        var text = t.Db.Queryable<PracticeText>().First(x => x.Code == "custom.1");
        var cat = t.Db.Queryable<Category>().First(c => c.Id == text.CategoryId);
        Assert.Equal(CategorySeeds.UncategorisedSubCode, cat.Code);
        Assert.Equal(2, text.Level);
        Assert.Equal("en", text.Language);
    }
}
