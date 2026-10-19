using TypeLab.Api.Data;
using TypeLab.Api.Models;

namespace TypeLab.Api.Tests;

public class CategorySeedsTests
{
    private static TestDb NewDb() => new(typeof(Category));

    [Fact]
    public void Seed_twice_keeps_41_rows()
    {
        using var t = NewDb();
        CategorySeeds.Seed(t.Db);
        CategorySeeds.Seed(t.Db);

        var rows = t.Db.Queryable<Category>().ToList();
        Assert.Equal(41, rows.Count);
        Assert.Equal(8, rows.Count(c => c.ParentId is null));
        Assert.Equal(33, rows.Count(c => c.ParentId is not null));
        Assert.Contains(rows, c => c.Code == "english/support-email");
        Assert.Contains(rows, c => c.Code == "code/c#");
        Assert.Contains(rows, c => c.Code == "timed/1-min");
    }

    [Fact]
    public void Seed_restores_shipped_name_but_keeps_user_rows()
    {
        using var t = NewDb();
        CategorySeeds.Seed(t.Db);

        var basic = t.Db.Queryable<Category>().First(c => c.Code == "basic");
        basic.Name = "x";
        t.Db.Updateable(basic).ExecuteCommand();
        var userId = t.Db.Insertable(new Category { Name = "Mine", Kind = "custom", SortOrder = 99 })
            .ExecuteReturnIdentity();

        CategorySeeds.Seed(t.Db);

        Assert.Equal("Basics", t.Db.Queryable<Category>().First(c => c.Code == "basic").Name);
        var mine = t.Db.Queryable<Category>().First(c => c.Id == userId);
        Assert.Equal("Mine", mine.Name);
        Assert.Null(mine.Code);
        Assert.Equal(42, t.Db.Queryable<Category>().Count());
    }

    [Fact]
    public void Uncategorised_is_last_and_has_one_sub()
    {
        using var t = NewDb();
        CategorySeeds.Seed(t.Db);

        var tops = t.Db.Queryable<Category>().Where(c => c.ParentId == null).OrderBy(c => c.SortOrder).ToList();
        var last = tops[^1];
        Assert.Equal(CategorySeeds.UncategorisedCode, last.Code);
        Assert.Equal("Uncategorised", last.Name);
        Assert.Equal("#8b877e", last.Color);

        var subs = t.Db.Queryable<Category>().Where(c => c.ParentId == last.Id).ToList();
        var sub = Assert.Single(subs);
        Assert.Equal(CategorySeeds.UncategorisedSubCode, sub.Code);
        Assert.Equal("custom", sub.Kind);
    }
}
