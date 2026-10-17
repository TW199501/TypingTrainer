using System.Diagnostics;
using System.Text;
using ELF.Modules.Excel.Abstractions.Enums;
using ELF.Modules.Excel.Abstractions.Exporting;
using ELF.Modules.Excel.Abstractions.Importing;
using ELF.Modules.Excel.Extensions.DependencyInjection;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using TypeLab.Api.Api;
using TypeLab.Api.Data;
using TypeLab.Api.Models;
using Xunit.Abstractions;

namespace TypeLab.Api.Tests;

/// <summary>Dictionary import from real files, read by ELF.Modules.Excel.</summary>
public class DictionaryImportTests(ITestOutputHelper output)
{
    private static readonly IServiceProvider Excel = new ServiceCollection()
        .AddLogging()
        .AddElfExcel(new ConfigurationBuilder().Build())
        .BuildServiceProvider();

    private static readonly WordImportMap Map = new("word", Zh: "zh", Topic: "topic");

    internal static IExcelImporter Importer => Excel.GetRequiredService<IExcelImporter>();

    private static TestDb NewDb()
    {
        var t = new TestDb(typeof(Word), typeof(WordExample), typeof(UserWordMastery), typeof(User));
        WordSeeds.Seed(t.Db);
        return t;
    }

    private static DictionaryService Dict(TestDb t) => new(t.Db, Importer);

    private static MemoryStream Utf8(string text) => new(Encoding.UTF8.GetBytes(text));

    private static Task<ImportWordsResult> Import(TestDb t, string fileName, Stream file, WordImportMap? map = null,
        bool skipDuplicates = true) =>
        Dict(t).ImportFileAsync(file, fileName, map ?? Map, skipDuplicates);

    private sealed record Row(string Word, string Zh, string Topic, string Example);

    private static async Task<MemoryStream> Xlsx(params Row[] rows)
    {
        var columns = new List<ExcelColumn>
        {
            new ExcelColumn<Row> { Key = "word", Header = "word", Value = r => r.Word },
            new ExcelColumn<Row> { Key = "zh", Header = "zh", Value = r => r.Zh },
            new ExcelColumn<Row> { Key = "topic", Header = "topic", Value = r => r.Topic },
            new ExcelColumn<Row> { Key = "example", Header = "example", Value = r => r.Example },
        };
        var stream = new MemoryStream();
        await Excel.GetRequiredService<IExcelExporter>().ExportAsync(stream, new ExcelSheetSpec
        {
            SheetName = "Words",
            RowType = typeof(Row),
            Columns = columns,
            Rows = rows,
            ExpectedRowCount = rows.Length,
        }, ExcelFormat.Xlsx);
        stream.Position = 0;
        return stream;
    }

    private static Word Saved(TestDb t, string text) => t.Db.Queryable<Word>().Single(w => w.Text == text);

    [Fact]
    public async Task Xlsx_rows_are_imported_by_header_with_examples()
    {
        using var t = NewDb();
        await using var file = await Xlsx(
            new Row("ledger", "總帳", "Accounting", "Post it to the ledger."),
            new Row("audit", "稽核", "", ""));

        var result = await Import(t, "words.xlsx", file, Map with { Example = "example" });

        Assert.Equal(new ImportWordsResult(2, 0), result);
        var ledger = Saved(t, "ledger");
        Assert.Equal(("總帳", "Accounting"), (ledger.Zh, ledger.Topic));
        Assert.Equal("Post it to the ledger.", t.Db.Queryable<WordExample>().Single(e => e.WordId == ledger.Id).Sentence);
        var audit = Saved(t, "audit");
        Assert.Equal("Uncategorised", audit.Topic);
        Assert.False(t.Db.Queryable<WordExample>().Any(e => e.WordId == audit.Id));
    }

    [Fact]
    public async Task Xlsx_preview_reports_headers_sample_and_format()
    {
        using var t = NewDb();
        await using var file = await Xlsx(new Row("ledger", "總帳", "Accounting", "x"));

        var preview = await Dict(t).PreviewAsync(file, "Words.XLSX");

        Assert.Equal("xlsx", preview.Format);
        Assert.Equal(["word", "zh", "topic", "example"], preview.Headers);
        Assert.Equal([["ledger", "總帳", "Accounting", "x"]], preview.Sample);
    }

    [Fact]
    public async Task Csv_preview_has_the_first_three_rows()
    {
        using var t = NewDb();
        var csv = "word,zh,topic\na,甲,T\nb,乙,T\nc,丙,T\nd,丁,T\n";

        var preview = await Dict(t).PreviewAsync(Utf8(csv), "w.csv");

        Assert.Equal("csv", preview.Format);
        Assert.Equal(["word", "zh", "topic"], preview.Headers);
        Assert.Equal([["a", "甲", "T"], ["b", "乙", "T"], ["c", "丙", "T"]], preview.Sample);
    }

    [Fact]
    public async Task Preview_of_a_header_only_file_has_headers_and_no_sample()
    {
        using var t = NewDb();

        var preview = await Dict(t).PreviewAsync(Utf8("word,zh,topic\n"), "w.csv");

        Assert.Equal(["word", "zh", "topic"], preview.Headers);
        Assert.Empty(preview.Sample);
    }

    [Fact]
    public async Task Quoted_csv_keeps_commas_inside_fields()
    {
        using var t = NewDb();
        var csv = "word,zh,topic\n\"apple, red\",\"蘋果，紅\",\"Fruit, fresh\"\n\"say \"\"hi\"\"\",問候,Talk\n";

        var result = await Import(t, "w.csv", Utf8(csv));

        Assert.Equal(2, result.Added);
        Assert.Equal("Fruit, fresh", Saved(t, "apple, red").Topic);
        Assert.Equal("蘋果，紅", Saved(t, "apple, red").Zh);
        Assert.Equal("問候", Saved(t, "say \"hi\"").Zh);
    }

    [Fact]
    public async Task Big5_csv_is_decoded()
    {
        using var t = NewDb();
        var bytes = Encoding.ASCII.GetBytes("word,zh,topic\nchinese,")
            .Concat(new byte[] { 0xA4, 0xA4, 0xA4, 0xE5 })
            .Concat(Encoding.ASCII.GetBytes(",Lang\n"))
            .ToArray();

        var preview = await Dict(t).PreviewAsync(new MemoryStream(bytes), "big5.csv");
        await Import(t, "big5.csv", new MemoryStream(bytes));

        Assert.Equal([["chinese", "中文", "Lang"]], preview.Sample);
        Assert.Equal("中文", Saved(t, "chinese").Zh);
    }

    [Fact]
    public async Task Tsv_reads_tabs_and_keeps_commas()
    {
        using var t = NewDb();

        var preview = await Dict(t).PreviewAsync(Utf8("word\tzh\ttopic\nyes, no\t是\tT\n"), "w.tsv");
        await Import(t, "w.tsv", Utf8("word\tzh\ttopic\nyes, no\t是\tT\n"));

        Assert.Equal("tsv", preview.Format);
        Assert.Equal("是", Saved(t, "yes, no").Zh);
    }

    [Theory]
    [InlineData("word\tzh\ttopic\nhello\t你好\tGreet\n")]
    [InlineData("word,zh,topic\r\nhello,你好,Greet\r\n")]
    public async Task Txt_uses_the_delimiter_of_its_first_line(string text)
    {
        using var t = NewDb();

        var preview = await Dict(t).PreviewAsync(Utf8(text), "w.txt");
        await Import(t, "w.txt", Utf8(text));

        Assert.Equal("txt", preview.Format);
        Assert.Equal(["word", "zh", "topic"], preview.Headers);
        Assert.Equal(("你好", "Greet"), (Saved(t, "hello").Zh, Saved(t, "hello").Topic));
    }

    [Fact]
    public async Task Txt_with_a_comma_header_and_a_tab_later_still_reads_commas()
    {
        using var t = NewDb();

        await Import(t, "w.txt", Utf8("word,zh,topic\nhello,你\t好,Greet\n"));

        Assert.Equal("你\t好", Saved(t, "hello").Zh);
    }

    [Fact]
    public async Task An_unknown_header_is_rejected_and_nothing_is_written()
    {
        using var t = NewDb();

        var ex = await Assert.ThrowsAsync<LibraryException>(() =>
            Import(t, "w.csv", Utf8("word,zh\na,甲\n"), Map with { Topic = "category" }));

        Assert.Equal(400, ex.Status);
        Assert.Contains("category", ex.Message);
        Assert.Equal(14, t.Db.Queryable<Word>().Count());
    }

    [Fact]
    public async Task An_unknown_header_is_rejected_in_a_header_only_file()
    {
        using var t = NewDb();

        var ex = await Assert.ThrowsAsync<LibraryException>(() =>
            Import(t, "w.csv", Utf8("word,zh\n"), Map with { Topic = "category" }));

        Assert.Equal(400, ex.Status);
    }

    [Fact]
    public async Task A_missing_word_column_is_rejected()
    {
        using var t = NewDb();

        var ex = await Assert.ThrowsAsync<LibraryException>(() =>
            Import(t, "w.csv", Utf8("word,zh\na,甲\n"), Map with { Word = " " }));

        Assert.Equal(400, ex.Status);
    }

    [Fact]
    public async Task Blank_words_reject_the_file_with_their_data_row_numbers()
    {
        using var t = NewDb();
        // Data row 2 has a quoted line break inside it; it is still one row, so the last is row 4.
        var csv = "word,zh,topic\nok,甲,T\n  ,\"two\nlines\",T\nfine,丙,T\n,丁,T\n";

        var ex = await Assert.ThrowsAsync<LibraryException>(() => Import(t, "w.csv", Utf8(csv)));

        Assert.Equal(400, ex.Status);
        Assert.Equal(["2", "4"], ex.Failed);
        Assert.Equal(2, ex.FailedCount);
        Assert.Equal(14, t.Db.Queryable<Word>().Count());
    }

    [Theory]
    [InlineData("w.csv", "\n  \r\n\t\nword,zh,topic\nok,甲,T\n,乙,T\n")]
    [InlineData("w.tsv", "\r\n\r\nword\tzh\ttopic\nok\t甲\tT\n\t乙\tT\n")]
    [InlineData("w.txt", "\n\nword\tzh\ttopic\nok\t甲\tT\n\t乙\tT\n")]
    public async Task Blank_lines_above_the_header_are_skipped_and_rows_count_from_the_first_data_row(
        string name, string text)
    {
        using var t = NewDb();

        var preview = await Dict(t).PreviewAsync(Utf8(text), name);
        var ex = await Assert.ThrowsAsync<LibraryException>(() => Import(t, name, Utf8(text)));

        Assert.Equal(["word", "zh", "topic"], preview.Headers);
        Assert.Equal([["ok", "甲", "T"], ["", "乙", "T"]], preview.Sample);
        Assert.Equal(["2"], ex.Failed);
        Assert.Equal(14, t.Db.Queryable<Word>().Count());
    }

    [Fact]
    public async Task Blank_lines_above_the_header_are_skipped_on_import()
    {
        using var t = NewDb();

        var result = await Import(t, "w.csv", Utf8("\r\n\r\nword,zh,topic\r\nhello,你好,Greet\r\n"));

        Assert.Equal(new ImportWordsResult(1, 0), result);
        Assert.Equal(("你好", "Greet"), (Saved(t, "hello").Zh, Saved(t, "hello").Topic));
    }

    [Fact]
    public async Task Blank_lines_above_the_header_of_a_header_only_file_are_skipped()
    {
        using var t = NewDb();

        var preview = await Dict(t).PreviewAsync(Utf8("\n\nword,zh,topic\n"), "w.csv");

        Assert.Equal(["word", "zh", "topic"], preview.Headers);
        Assert.Empty(preview.Sample);
    }

    [Fact]
    public async Task A_blank_word_in_a_workbook_is_numbered_from_the_first_data_row()
    {
        using var t = NewDb();
        await using var file = await Xlsx(new Row("ledger", "總帳", "A", ""), new Row("", "空", "A", ""));

        var ex = await Assert.ThrowsAsync<LibraryException>(() => Import(t, "w.xlsx", file));

        Assert.Equal(["2"], ex.Failed);
    }

    [Fact]
    public async Task Blank_words_after_a_full_batch_still_write_nothing()
    {
        using var t = NewDb();
        var csv = new StringBuilder("word,zh,topic\n");
        for (var i = 0; i < 2500; i++)
        {
            csv.Append("w").Append(i).Append(",z,T\n");
        }

        for (var i = 0; i < 60; i++)
        {
            csv.Append(",z,T\n");
        }

        var ex = await Assert.ThrowsAsync<LibraryException>(() => Import(t, "w.csv", Utf8(csv.ToString())));

        Assert.Equal(DictionaryService.MaxFailedReported, ex.Failed!.Count);
        Assert.Equal("2501", ex.Failed[0]);
        Assert.Equal(60, ex.FailedCount);
        Assert.Equal(14, t.Db.Queryable<Word>().Count());
        Assert.Equal(14, t.Db.Queryable<WordExample>().Count());
    }

    [Fact]
    public async Task Duplicates_in_the_db_and_the_file_are_skipped()
    {
        using var t = NewDb();
        var csv = "word,zh,topic\nBalance,餘額,Banking\nnovel,小說,Misc\nNOVEL,小說,Misc\nnovel,小說,misc\nfresh,新,Misc\n";

        var result = await Import(t, "w.csv", Utf8(csv), skipDuplicates: true);

        Assert.Equal(new ImportWordsResult(3, 2), result);
        Assert.Equal(17, t.Db.Queryable<Word>().Count());
    }

    [Fact]
    public async Task Duplicates_are_kept_without_skip()
    {
        using var t = NewDb();
        var csv = "word,zh,topic,example\nbalance,餘額,Banking,\nbalance,餘額,Banking,A sentence.\n";

        var result = await Import(t, "w.csv", Utf8(csv), Map with { Example = "example" }, skipDuplicates: false);

        Assert.Equal(new ImportWordsResult(2, 0), result);
        Assert.Equal(3, t.Db.Queryable<Word>().Count(w => w.Text == "balance"));
        Assert.Equal(15, t.Db.Queryable<WordExample>().Count());
    }

    [Theory]
    [InlineData("words.json")]
    [InlineData("words.xls")]
    [InlineData("words")]
    public async Task Other_extensions_are_rejected(string name)
    {
        using var t = NewDb();

        var preview = await Assert.ThrowsAsync<LibraryException>(() => Dict(t).PreviewAsync(Utf8("word\na\n"), name));
        var import = await Assert.ThrowsAsync<LibraryException>(() => Import(t, name, Utf8("word\na\n")));

        Assert.Equal((400, 400), (preview.Status, import.Status));
        Assert.StartsWith("Unsupported file type", preview.Message);
        Assert.StartsWith("Unsupported file type", import.Message);
        Assert.Equal(14, t.Db.Queryable<Word>().Count());
    }

    [Fact]
    public async Task A_damaged_workbook_is_a_400()
    {
        using var t = NewDb();

        var ex = await Assert.ThrowsAsync<LibraryException>(() =>
            Dict(t).PreviewAsync(Utf8("this is not a workbook"), "w.xlsx"));

        Assert.Equal(400, ex.Status);
    }

    [Fact]
    public async Task A_100k_row_csv_imports_in_one_go()
    {
        using var t = NewDb();
        const int count = 100_000;
        var csv = new StringBuilder("word,zh,phonetic,topic,example\n");
        for (var i = 0; i < count; i++)
        {
            csv.Append("word").Append(i).Append(",中文").Append(i).Append(",/w/,Topic").Append(i % 40)
                .Append(",\"An example, number ").Append(i).Append(".\"\n");
        }

        var bytes = Encoding.UTF8.GetBytes(csv.ToString());
        var watch = Stopwatch.StartNew();
        var result = await Import(t, "big.csv", new MemoryStream(bytes),
            Map with { Phonetic = "phonetic", Example = "example" });
        watch.Stop();
        output.WriteLine($"100k-row CSV ({bytes.Length:N0} bytes): {watch.ElapsedMilliseconds:N0} ms");

        Assert.Equal(new ImportWordsResult(count, 0), result);
        Assert.Equal(count + 14, t.Db.Queryable<Word>().Count());
        Assert.Equal(count + 14, t.Db.Queryable<WordExample>().Count());
        var last = Saved(t, "word99999");
        Assert.Equal("An example, number 99999.", t.Db.Queryable<WordExample>().Single(e => e.WordId == last.Id).Sentence);
    }
}
