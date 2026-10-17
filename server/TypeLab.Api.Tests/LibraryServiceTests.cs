using TypeLab.Api.Api;
using TypeLab.Api.Data;
using TypeLab.Api.Models;

namespace TypeLab.Api.Tests;

public class LibraryServiceTests
{
    private static TestDb NewDb()
    {
        var t = new TestDb(
            typeof(Category), typeof(PracticeText), typeof(TextSegmentation), typeof(TextSegment), typeof(User));
        CategorySeeds.Seed(t.Db);
        TextSeeds.Seed(t.Db);
        return t;
    }

    private static CreateTextRequest Text(string title, string content, string? categoryId = null,
        string? sub = null, string? fileName = null) =>
        new(title, content, categoryId, sub, null, fileName);

    [Fact]
    public async Task Categories_tree_has_8_tops_and_counts()
    {
        using var t = NewDb();
        var tree = await new LibraryService(t.Db).GetCategoriesAsync();

        Assert.Equal(8, tree.Count);
        var basic = tree.Single(c => c.Id == "basic");
        Assert.Equal(3, basic.Children[0].Count);
        var custom = tree.Single(c => c.Id == "custom");
        Assert.True(custom.IsBuiltIn);
        Assert.Equal("custom", custom.Id);
    }

    [Fact]
    public async Task Create_top_then_sub_appears_in_tree()
    {
        using var t = NewDb();
        var lib = new LibraryService(t.Db);

        var topId = await lib.CreateCategoryAsync(new("top", null, "Poems", null));
        var subId = await lib.CreateCategoryAsync(new("sub", topId, "Tang", null));

        var top = (await lib.GetCategoriesAsync()).Single(c => c.Id == topId);
        Assert.Equal("custom", top.Kind);
        Assert.Equal("en", top.Layout);
        Assert.False(top.IsBuiltIn);
        var sub = Assert.Single(top.Children);
        Assert.Equal(subId, sub.Id);
        Assert.Equal("Tang", sub.Name);
        Assert.False(sub.IsBuiltIn);
    }

    [Fact]
    public async Task User_top_categories_sort_before_uncategorised()
    {
        using var t = NewDb();
        var lib = new LibraryService(t.Db);

        var first = await lib.CreateCategoryAsync(new("top", null, "Poems", null));
        var second = await lib.CreateCategoryAsync(new("top", null, "Letters", null));
        CategorySeeds.Seed(t.Db);

        var ids = (await lib.GetCategoriesAsync()).Select(c => c.Id).ToList();
        Assert.Equal("custom", ids[^1]);
        Assert.Equal([first, second], ids[^3..^1]);
        Assert.Equal("basic", ids[0]);
    }

    [Fact]
    public async Task Rename_user_category()
    {
        using var t = NewDb();
        var lib = new LibraryService(t.Db);
        var id = await lib.CreateCategoryAsync(new("top", null, "Poems", null));

        await lib.RenameCategoryAsync(id, "  Verse ");

        Assert.Equal("Verse", (await lib.GetCategoriesAsync()).Single(c => c.Id == id).Name);
    }

    [Fact]
    public async Task Rename_or_delete_builtin_category_is_409()
    {
        using var t = NewDb();
        var lib = new LibraryService(t.Db);
        var firstSub = (await lib.GetCategoriesAsync()).Single(c => c.Id == "basic").Children[0].Id;

        foreach (var id in new[] { "basic", firstSub })
        {
            Assert.Equal(409, (await Assert.ThrowsAsync<LibraryException>(() => lib.RenameCategoryAsync(id, "x"))).Status);
            Assert.Equal(409, (await Assert.ThrowsAsync<LibraryException>(() => lib.DeleteCategoryAsync(id))).Status);
        }

        Assert.Equal(404, (await Assert.ThrowsAsync<LibraryException>(() => lib.DeleteCategoryAsync("9999"))).Status);
    }

    [Fact]
    public async Task Rename_to_blank_is_400()
    {
        using var t = NewDb();
        var lib = new LibraryService(t.Db);
        var id = await lib.CreateCategoryAsync(new("top", null, "Poems", null));

        var ex = await Assert.ThrowsAsync<LibraryException>(() => lib.RenameCategoryAsync(id, "   "));

        Assert.Equal(400, ex.Status);
    }

    [Fact]
    public async Task Delete_top_removes_subs_and_moves_texts_to_uncategorised()
    {
        using var t = NewDb();
        var lib = new LibraryService(t.Db);
        var topId = await lib.CreateCategoryAsync(new("top", null, "Poems", null));
        await lib.CreateCategoryAsync(new("sub", topId, "Tang", null));
        var text = await lib.CreateTextAsync(Text("t", "body", topId, "Tang"));
        var before = t.Db.Queryable<Category>().Count();

        await lib.DeleteCategoryAsync(topId);

        Assert.Equal(before - 2, t.Db.Queryable<Category>().Count());
        var moved = await lib.GetTextAsync(text.Id);
        Assert.Equal("custom", moved!.CategoryId);
        Assert.Equal("Uncategorised", moved.Sub);
    }

    [Fact]
    public async Task List_omits_content_and_reports_total()
    {
        using var t = NewDb();
        var page = await new LibraryService(t.Db).ListTextsAsync(null, null, null, null, 1, 5);

        Assert.Equal(5, page.Rows.Count);
        Assert.Equal(15, page.Total);
        Assert.All(page.Rows, r => Assert.Null(r.Content));
    }

    [Fact]
    public async Task List_puts_newest_user_text_first()
    {
        using var t = NewDb();
        var lib = new LibraryService(t.Db);
        await lib.CreateTextAsync(Text("older", "a"));
        await Task.Delay(20);
        var newer = await lib.CreateTextAsync(Text("newer", "b"));

        var page = await lib.ListTextsAsync(null, null, null, null, 1, 50);

        Assert.Equal(newer.Id, page.Rows[0].Id);
        Assert.Equal("older", page.Rows[1].Title);
        Assert.All(page.Rows.Skip(2), r => Assert.True(r.IsBuiltIn));
        var builtIn = page.Rows.Skip(2).Select(r => r.Id).ToList();
        Assert.Equal(builtIn.Order().ToList(), builtIn);
        Assert.Equal(["older", "newer"], (await lib.ListTextsAsync(null, null, null, false, 1, 50))
            .Rows.Select(r => r.Title).Reverse().ToArray());
    }

    [Fact]
    public async Task Get_includes_content()
    {
        using var t = NewDb();
        var lib = new LibraryService(t.Db);
        var id = (await lib.ListTextsAsync(null, null, null, null, 1, 1)).Rows[0].Id;

        var text = await lib.GetTextAsync(id);

        Assert.False(string.IsNullOrEmpty(text!.Content));
        Assert.Null(await lib.GetTextAsync(99999));
    }

    [Fact]
    public async Task Create_without_category_goes_to_uncategorised()
    {
        using var t = NewDb();
        var lib = new LibraryService(t.Db);

        var text = await lib.CreateTextAsync(new("Mine", "hello world", null, null, "L4", null));

        Assert.Equal("custom", text.CategoryId);
        Assert.Equal("Uncategorised", text.Sub);
        Assert.Equal("L4", text.Level);
        Assert.Equal(11, text.Chars);
        Assert.False(text.IsBuiltIn);
        var row = t.Db.Queryable<PracticeText>().First(x => x.Id == text.Id);
        Assert.Equal(LocalUserSeeds.Seed(t.Db), row.CreatedBy);
        Assert.Equal("en", row.Language);
    }

    [Fact]
    public async Task Create_with_unknown_sub_creates_the_sub()
    {
        using var t = NewDb();
        var lib = new LibraryService(t.Db);
        var before = t.Db.Queryable<Category>().Count();

        var text = await lib.CreateTextAsync(Text("Ode", "roses", "english", "Poetry"));
        await lib.CreateTextAsync(Text("Ode 2", "violets", "english", "poetry"));

        Assert.Equal(before + 1, t.Db.Queryable<Category>().Count());
        Assert.Equal("Poetry", text.Sub);
        var english = (await lib.GetCategoriesAsync()).Single(c => c.Id == "english");
        Assert.Equal(2, english.Children.Single(s => s.Name == "Poetry").Count);
    }

    [Fact]
    public async Task Import_with_one_blank_text_saves_nothing()
    {
        using var t = NewDb();
        var lib = new LibraryService(t.Db);

        var ex = await Assert.ThrowsAsync<LibraryException>(() => lib.ImportTextsAsync(new([
            Text("a", "alpha", fileName: "a.txt"),
            Text("b", "   ", fileName: "b.txt"),
        ])));

        Assert.Equal(400, ex.Status);
        Assert.Equal(["b.txt"], ex.Failed);
        Assert.Equal(15, t.Db.Queryable<PracticeText>().Count());

        var saved = await lib.ImportTextsAsync(new([Text("a", "alpha"), Text("b", "beta")]));
        Assert.Equal(2, saved.Count);
        Assert.Equal(17, t.Db.Queryable<PracticeText>().Count());

        var unnamed = await Assert.ThrowsAsync<LibraryException>(() =>
            lib.ImportTextsAsync(new([Text("a", "alpha"), Text("", "x")])));
        Assert.Equal(["2"], unnamed.Failed);
    }

    [Fact]
    public async Task Delete_builtin_text_is_409()
    {
        using var t = NewDb();
        var lib = new LibraryService(t.Db);
        var id = (await lib.ListTextsAsync(null, null, null, true, 1, 1)).Rows[0].Id;

        var ex = await Assert.ThrowsAsync<LibraryException>(() => lib.DeleteTextAsync(id));

        Assert.Equal(409, ex.Status);
        Assert.Equal(404, (await Assert.ThrowsAsync<LibraryException>(() => lib.DeleteTextAsync(99999))).Status);
    }

    [Fact]
    public async Task Delete_user_text_removes_its_segmentations()
    {
        using var t = NewDb();
        var lib = new LibraryService(t.Db);
        var text = await lib.CreateTextAsync(Text("Mine", "hello"));
        var pass = t.Db.Insertable(new TextSegmentation { TextId = text.Id, Engine = "manual" }).ExecuteReturnIdentity();
        t.Db.Insertable(new TextSegment { SegmentationId = pass, Seq = 0, Token = "hello", CharStart = 0, CharLength = 5 })
            .ExecuteCommand();

        await lib.DeleteTextAsync(text.Id);

        Assert.Null(await lib.GetTextAsync(text.Id));
        Assert.Equal(0, t.Db.Queryable<TextSegmentation>().Count());
        Assert.Equal(0, t.Db.Queryable<TextSegment>().Count());
    }
}
