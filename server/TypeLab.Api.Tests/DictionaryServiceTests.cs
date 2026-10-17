using TypeLab.Api.Api;
using TypeLab.Api.Data;
using TypeLab.Api.Models;

namespace TypeLab.Api.Tests;

public class DictionaryServiceTests
{
    private static TestDb NewDb()
    {
        var t = new TestDb(typeof(Word), typeof(WordExample), typeof(UserWordMastery), typeof(User));
        WordSeeds.Seed(t.Db);
        return t;
    }

    private static ImportWordRow Row(string word, string? topic = null, string? example = null) =>
        new(word, "zh " + word, null, null, topic, example);

    [Fact]
    public void Seed_twice_keeps_14_words()
    {
        using var t = NewDb();
        WordSeeds.Seed(t.Db);

        Assert.Equal(14, t.Db.Queryable<Word>().Count());
        Assert.Equal(14, t.Db.Queryable<WordExample>().Count());
        Assert.Equal(0, t.Db.Queryable<UserWordMastery>().Count());
    }

    [Fact]
    public async Task List_reports_total_and_pages()
    {
        using var t = NewDb();
        var dict = new DictionaryService(t.Db);

        var first = await dict.ListAsync(null, null, 1, 5);
        var last = await dict.ListAsync(null, null, 3, 5);

        Assert.Equal(5, first.Rows.Count);
        Assert.Equal(14, first.Total);
        Assert.Equal(4, last.Rows.Count);
        var word = first.Rows[0];
        Assert.Equal("exchange rate", word.Word);
        Assert.Equal("匯率", word.Zh);
        Assert.Equal("The exchange rate today is lower than the rate we locked last week.", word.Example);
    }

    [Fact]
    public async Task List_filters_by_topic_and_query()
    {
        using var t = NewDb();
        var dict = new DictionaryService(t.Db);

        var banking = await dict.ListAsync("Banking", null, 1, 50);
        Assert.NotEmpty(banking.Rows);
        Assert.All(banking.Rows, r => Assert.Equal("Banking", r.Topic));
        Assert.Equal(banking.Rows.Count, banking.Total);

        var byText = await dict.ListAsync(null, "EXCHANGE", 1, 50);
        Assert.Equal("exchange rate", Assert.Single(byText.Rows).Word);

        var byZh = await dict.ListAsync(null, "利率", 1, 50);
        Assert.Equal("interest rate", Assert.Single(byZh.Rows).Word);

        var none = await dict.ListAsync("Banking", "no such word", 1, 50);
        Assert.Empty(none.Rows);
        Assert.Equal(0, none.Total);
    }

    [Fact]
    public async Task Mastery_comes_from_local_user_or_zero()
    {
        using var t = NewDb();
        var userId = LocalUserSeeds.Seed(t.Db);
        var other = t.Db.Insertable(new User { Username = "someone" }).ExecuteReturnIdentity();
        var word = t.Db.Queryable<Word>().First(w => w.Text == "balance");
        t.Db.Insertable(new UserWordMastery { UserId = userId, WordId = word.Id, Mastery = 81 }).ExecuteCommand();
        var rate = t.Db.Queryable<Word>().First(w => w.Text == "exchange rate");
        t.Db.Insertable(new UserWordMastery { UserId = other, WordId = rate.Id, Mastery = 55 }).ExecuteCommand();

        var rows = (await new DictionaryService(t.Db).ListAsync(null, null, 1, 50)).Rows;

        Assert.Equal(81, rows.Single(r => r.Word == "balance").Mastery);
        Assert.Equal(0, rows.Single(r => r.Word == "exchange rate").Mastery);
    }

    [Fact]
    public async Task Import_skips_duplicates_in_db_and_in_batch()
    {
        using var t = NewDb();
        var dict = new DictionaryService(t.Db);

        var result = await dict.ImportAsync(new(true,
        [
            Row("Balance", "Banking"),
            Row("novel", "Misc"),
            Row("NOVEL", "misc"),
            Row("fresh", "Misc"),
        ]));

        Assert.Equal(2, result.Added);
        Assert.Equal(2, result.Skipped);
        Assert.Equal(16, t.Db.Queryable<Word>().Count());
    }

    [Fact]
    public async Task Import_without_skip_keeps_duplicates()
    {
        using var t = NewDb();
        var dict = new DictionaryService(t.Db);

        var result = await dict.ImportAsync(new(false, [Row("balance", "Banking"), Row("balance", "Banking", "A sentence.")]));

        Assert.Equal(2, result.Added);
        Assert.Equal(0, result.Skipped);
        Assert.Equal(3, t.Db.Queryable<Word>().Count(w => w.Text == "balance"));
        Assert.Equal(15, t.Db.Queryable<WordExample>().Count());
    }

    [Fact]
    public async Task Import_blank_word_saves_nothing()
    {
        using var t = NewDb();
        var dict = new DictionaryService(t.Db);

        var ex = await Assert.ThrowsAsync<LibraryException>(() =>
            dict.ImportAsync(new(true, [Row("ok"), Row("   "), Row("also ok")])));

        Assert.Equal(400, ex.Status);
        Assert.Equal(["2"], ex.Failed);
        Assert.Equal(14, t.Db.Queryable<Word>().Count());
    }

    [Fact]
    public async Task Import_blank_topic_becomes_uncategorised()
    {
        using var t = NewDb();
        var dict = new DictionaryService(t.Db);

        await dict.ImportAsync(new(true, [Row("  spare  ", "  ", "An example.")]));

        var saved = (await dict.ListAsync("Uncategorised", null, 1, 50)).Rows.Single();
        Assert.Equal("spare", saved.Word);
        Assert.Equal("An example.", saved.Example);
    }
}
