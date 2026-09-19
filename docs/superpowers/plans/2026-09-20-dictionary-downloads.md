# Dictionary Downloads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user install ECDICT and CC-CEDICT with one button, fetched from each project's own origin, instead of hunting down the files themselves.

**Architecture:** A seeded catalogue table mirrors `LocalModels`. Files download into a `dictionaries/` folder beside `models/` under the same per-runtime root. Downloads run in the background behind a job-status endpoint; parsers stream into `Words` in batches. Nothing is hosted or redistributed by us.

**Tech Stack:** ASP.NET Core 10 minimal APIs, SqlSugar on SQLite, xUnit, Vue 3 + Pinia, vitest.

**Spec:** `docs/superpowers/specs/2026-09-20-dictionary-downloads-spec.md`

## Global Constraints

- Entities carry no `required` members — SqlSugar materialises through `Activator.CreateInstance`, which throws on them. Use property defaults.
- `DateTime` in UTC, never `DateTimeOffset` — SQLite cannot store it natively.
- Seeding never resets runtime state (`Installed`, `InstalledAt`, `EntryCount`).
- Server test files live in `server/TypeLab.Api.Tests/`; front-end tests sit beside the file they cover (`foo.ts` → `foo.test.ts`).
- Commit subjects must not contain `[release]` — that string triggers a tagged release build.
- `npm run format` before committing anything under `apps/` or `docs/`.
- New tables must be registered in `SqlSugarSetup.Entities` or they are never created.

---

## File Structure

**Created:**

| File                                                | Responsibility                                 |
| --------------------------------------------------- | ---------------------------------------------- |
| `server/TypeLab.Api/Models/DictionarySource.cs`     | The catalogue entity                           |
| `server/TypeLab.Api/Data/DictionarySourceSeeds.cs`  | The three seeded rows                          |
| `server/TypeLab.Api/Data/DictionaryStorage.cs`      | Resolves `dictionaries/`, sibling of `models/` |
| `server/TypeLab.Api/Import/EcdictParser.cs`         | ECDICT CSV → `Word`                            |
| `server/TypeLab.Api/Import/CcCedictParser.cs`       | CC-CEDICT lines → `Word`                       |
| `server/TypeLab.Api/Import/WordImporter.cs`         | Batched insert with dedupe                     |
| `server/TypeLab.Api/Import/DictionaryDownloader.cs` | Background fetch + job state                   |
| `server/TypeLab.Api/Api/DictionaryEndpoints.cs`     | The four routes                                |
| `apps/src/stores/dictionary.sources.test.ts`        | Store tests                                    |

**Modified:**

| File                                                   | Change                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| `server/TypeLab.Api/Data/SqlSugarSetup.cs`             | Register entity; call seeds                                        |
| `server/TypeLab.Api/Program.cs`                        | Register services; map routes                                      |
| `server/TypeLab.Api/Data/CatalogueTranslationSeeds.cs` | zh-TW/zh-CN for the catalogue                                      |
| `apps/src/api/types.ts`                                | `DictionarySourceDto`, `DictionaryStorageDto`, `DownloadStatusDto` |
| `apps/src/api/index.ts`                                | `api.dictionaries.*`                                               |
| `apps/src/api/mock/fixtures.ts`                        | `dictionarySources()`                                              |
| `apps/src/stores/dictionary.ts`                        | `sources`, `loadSources`, `download`, `remove`                     |
| `apps/src/views/DictionaryView.vue`                    | Licence, homepage link, Download button                            |
| `docs/api-contract.md`                                 | Endpoints and the table                                            |

---

### Task 1: Catalogue entity and seeds

**Files:**

- Create: `server/TypeLab.Api/Models/DictionarySource.cs`
- Create: `server/TypeLab.Api/Data/DictionarySourceSeeds.cs`
- Modify: `server/TypeLab.Api/Data/SqlSugarSetup.cs`
- Test: `server/TypeLab.Api.Tests/DictionarySourceSeedsTests.cs`

**Interfaces:**

- Consumes: `TestDb` from `server/TypeLab.Api.Tests/TestDb.cs` (existing), exposing `.Db` as `ISqlSugarClient` and implementing `IDisposable`.
- Produces: `DictionarySource` entity; `DictionarySourceSeeds.All` (array) and `DictionarySourceSeeds.Seed(ISqlSugarClient)`.

- [ ] **Step 1: Write the failing test**

Create `server/TypeLab.Api.Tests/DictionarySourceSeedsTests.cs`:

```csharp
using SqlSugar;
using TypeLab.Api.Data;
using TypeLab.Api.Models;

namespace TypeLab.Api.Tests;

public class DictionarySourceSeedsTests
{
    [Fact]
    public void Seeds_the_three_sources_with_real_urls()
    {
        using var db = new TestDb();
        DictionarySourceSeeds.Seed(db.Db);

        var rows = db.Db.Queryable<DictionarySource>().ToList();

        Assert.Equal(3, rows.Count);
        Assert.All(rows, r => Assert.StartsWith("https://", r.SourceUrl));
        Assert.All(rows, r => Assert.False(string.IsNullOrWhiteSpace(r.Licence)));
    }

    [Fact]
    public void WordNet_is_listed_but_not_importable()
    {
        using var db = new TestDb();
        DictionarySourceSeeds.Seed(db.Db);

        var wordnet = db.Db.Queryable<DictionarySource>().First(s => s.Code == "wordnet");

        Assert.False(wordnet.SupportsImport);
        Assert.True(db.Db.Queryable<DictionarySource>().First(s => s.Code == "ecdict").SupportsImport);
    }

    /// <summary>Re-seeding must not undo an install the user already performed.</summary>
    [Fact]
    public void Reseeding_refreshes_copy_but_keeps_install_state()
    {
        using var db = new TestDb();
        DictionarySourceSeeds.Seed(db.Db);

        var row = db.Db.Queryable<DictionarySource>().First(s => s.Code == "ecdict");
        row.Installed = true;
        row.EntryCount = 770_000;
        row.Description = "stale";
        db.Db.Updateable(row).ExecuteCommand();

        DictionarySourceSeeds.Seed(db.Db);

        var after = db.Db.Queryable<DictionarySource>().First(s => s.Code == "ecdict");
        Assert.True(after.Installed);
        Assert.Equal(770_000, after.EntryCount);
        Assert.NotEqual("stale", after.Description);
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `dotnet test server/TypeLab.slnx --filter FullyQualifiedName~DictionarySourceSeedsTests`
Expected: compile error — `DictionarySource` and `DictionarySourceSeeds` do not exist.

- [ ] **Step 3: Write the entity**

Create `server/TypeLab.Api/Models/DictionarySource.cs`:

```csharp
using SqlSugar;

namespace TypeLab.Api.Models;

/// <summary>
/// A dictionary the app can fetch on the user's behalf.
///
/// We never host or redistribute the data — <see cref="SourceUrl"/> points at
/// each project's own origin. That keeps CC-CEDICT's share-alike terms off this
/// repository while giving the user a one-button install.
/// </summary>
[SugarTable("DictionarySources")]
[SugarIndex("ux_dictsources_code", nameof(Code), OrderByType.Asc, true)]
public class DictionarySource
{
    [SugarColumn(IsPrimaryKey = true, IsIdentity = true)]
    public int Id { get; set; }

    /// <summary>Stable identifier and on-disk folder name: ecdict · cc-cedict · wordnet.</summary>
    [SugarColumn(Length = 64)]
    public string Code { get; set; } = string.Empty;

    [SugarColumn(Length = 128)]
    public string Name { get; set; } = string.Empty;

    [SugarColumn(Length = 512)]
    public string Description { get; set; } = string.Empty;

    [SugarColumn(Length = 512)]
    public string SourceUrl { get; set; } = string.Empty;

    /// <summary>Shown as attribution; required by CC BY-SA and by WordNet's terms.</summary>
    [SugarColumn(Length = 512)]
    public string HomepageUrl { get; set; } = string.Empty;

    [SugarColumn(Length = 64)]
    public string Licence { get; set; } = string.Empty;

    /// <summary>Selects the parser: ecdict-csv · cc-cedict · wordnet.</summary>
    [SugarColumn(Length = 32)]
    public string Format { get; set; } = string.Empty;

    /// <summary>gzip, or null when the origin serves the file uncompressed.</summary>
    [SugarColumn(Length = 16, IsNullable = true)]
    public string? Compression { get; set; }

    public int ApproxEntries { get; set; }

    /// <summary>False for sources listed for reference only; the API refuses to download them.</summary>
    public bool SupportsImport { get; set; }

    public int SortOrder { get; set; }

    // Runtime state below — seeding must never reset these.
    public bool Installed { get; set; }

    [SugarColumn(IsNullable = true)]
    public DateTime? InstalledAt { get; set; }

    public int EntryCount { get; set; }
}
```

- [ ] **Step 4: Write the seeds**

Create `server/TypeLab.Api/Data/DictionarySourceSeeds.cs`:

```csharp
using SqlSugar;
using TypeLab.Api.Models;

namespace TypeLab.Api.Data;

/// <summary>
/// The dictionaries offered on the import dialog. URLs point at each project's
/// own origin — verified 2026-09-20 — and can rot; a failed download reports
/// the URL so that is diagnosable without reading this file.
/// </summary>
public static class DictionarySourceSeeds
{
    public static readonly DictionarySource[] All =
    [
        new()
        {
            Code = "ecdict",
            Name = "ECDICT",
            Description = "English–Chinese, about 770k entries, with frequency tags",
            SourceUrl = "https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv",
            HomepageUrl = "https://github.com/skywind3000/ECDICT",
            Licence = "MIT",
            Format = "ecdict-csv",
            Compression = null,
            ApproxEntries = 770_000,
            SupportsImport = true,
            SortOrder = 1,
        },
        new()
        {
            Code = "cc-cedict",
            Name = "CC-CEDICT",
            Description = "Chinese–English, suited to the Chinese-to-English direction",
            SourceUrl = "https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz",
            HomepageUrl = "https://www.mdbg.net/chinese/dictionary?page=cc-cedict",
            Licence = "CC BY-SA 4.0",
            Format = "cc-cedict",
            Compression = "gzip",
            ApproxEntries = 120_000,
            SupportsImport = true,
            SortOrder = 2,
        },
        new()
        {
            // Listed so the dialog can link to it. Its format is a set of
            // database files unlike the other two, and it carries no Chinese
            // glosses, so importing it serves a different purpose entirely.
            Code = "wordnet",
            Name = "WordNet",
            Description = "English lexical database, for filling in missing example sentences",
            SourceUrl = "https://wordnetcode.princeton.edu/wn3.1.dict.tar.gz",
            HomepageUrl = "https://wordnet.princeton.edu/download/current-version",
            Licence = "WordNet",
            Format = "wordnet",
            Compression = "gzip",
            ApproxEntries = 155_000,
            SupportsImport = false,
            SortOrder = 3,
        },
    ];

    public static void Seed(ISqlSugarClient db)
    {
        var existing = db.Queryable<DictionarySource>().ToList().ToDictionary(s => s.Code, s => s);

        foreach (var seed in All)
        {
            if (!existing.TryGetValue(seed.Code, out var row))
            {
                db.Insertable(seed).ExecuteCommand();
                continue;
            }

            row.Name = seed.Name;
            row.Description = seed.Description;
            row.SourceUrl = seed.SourceUrl;
            row.HomepageUrl = seed.HomepageUrl;
            row.Licence = seed.Licence;
            row.Format = seed.Format;
            row.Compression = seed.Compression;
            row.ApproxEntries = seed.ApproxEntries;
            row.SupportsImport = seed.SupportsImport;
            row.SortOrder = seed.SortOrder;
            db.Updateable(row).ExecuteCommand();
        }
    }
}
```

- [ ] **Step 5: Register the entity and the seed**

In `server/TypeLab.Api/Data/SqlSugarSetup.cs`, add to the `Entities` array after `typeof(LocalModelEntry),`:

```csharp
        typeof(DictionarySource),
```

and in `InitDatabase`, after `ModelSeeds.Seed(db);`:

```csharp
        DictionarySourceSeeds.Seed(db);
```

- [ ] **Step 6: Run tests**

Run: `dotnet test server/TypeLab.slnx --filter FullyQualifiedName~DictionarySourceSeedsTests`
Expected: PASS, 3 tests.

- [ ] **Step 7: Commit**

```bash
git add server/TypeLab.Api/Models/DictionarySource.cs server/TypeLab.Api/Data/DictionarySourceSeeds.cs server/TypeLab.Api/Data/SqlSugarSetup.cs server/TypeLab.Api.Tests/DictionarySourceSeedsTests.cs
git commit -m "Add the dictionary source catalogue"
```

---

### Task 2: Storage directory

**Files:**

- Create: `server/TypeLab.Api/Data/DictionaryStorage.cs`
- Test: `server/TypeLab.Api.Tests/DictionaryStorageTests.cs`

**Interfaces:**

- Consumes: `ModelStorage` (existing) — constructor `(IConfiguration, IHostEnvironment)`, property `Root`.
- Produces: `DictionaryStorage` with `Root`, `PathFor(string code)`, `UsedBytes()`, `EnsureWritable()`.

- [ ] **Step 1: Write the failing test**

Create `server/TypeLab.Api.Tests/DictionaryStorageTests.cs`:

```csharp
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using TypeLab.Api.Data;

namespace TypeLab.Api.Tests;

public class DictionaryStorageTests
{
    private sealed class FakeEnv : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Test";
        public string ApplicationName { get; set; } = "TypeLab.Api.Tests";
        public string ContentRootPath { get; set; } = Path.GetTempPath();
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private static (ModelStorage Models, DictionaryStorage Dicts) Build(string modelDir)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Models:Directory"] = modelDir })
            .Build();
        var env = new FakeEnv();
        var models = new ModelStorage(config, env);
        return (models, new DictionaryStorage(models));
    }

    /// <summary>
    /// Beside models, not inside: ModelStorage.UsedBytes() feeds the Models
    /// page's "Used" figure, and nesting would silently inflate it.
    /// </summary>
    [Fact]
    public void Sits_beside_the_model_directory_not_inside_it()
    {
        var root = Path.Combine(Path.GetTempPath(), "typelab-store", "models");

        var (models, dicts) = Build(root);

        Assert.False(dicts.Root.StartsWith(models.Root, StringComparison.OrdinalIgnoreCase));
        Assert.Equal(Path.GetDirectoryName(models.Root), Path.GetDirectoryName(dicts.Root));
        Assert.EndsWith("dictionaries", dicts.Root);
    }

    [Fact]
    public void PathFor_gives_each_source_its_own_folder()
    {
        var (_, dicts) = Build(Path.Combine(Path.GetTempPath(), "typelab-store", "models"));

        Assert.Equal(Path.Combine(dicts.Root, "ecdict"), dicts.PathFor("ecdict"));
    }

    [Fact]
    public void EnsureWritable_creates_the_directory_and_leaves_no_probe_behind()
    {
        var root = Path.Combine(Path.GetTempPath(), "typelab-" + Guid.NewGuid().ToString("N"), "models");
        var (_, dicts) = Build(root);
        try
        {
            Assert.True(dicts.EnsureWritable());
            Assert.True(Directory.Exists(dicts.Root));
            Assert.Empty(Directory.GetFiles(dicts.Root));
        }
        finally
        {
            var parent = Path.GetDirectoryName(root);
            if (parent is not null && Directory.Exists(parent)) Directory.Delete(parent, recursive: true);
        }
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `dotnet test server/TypeLab.slnx --filter FullyQualifiedName~DictionaryStorageTests`
Expected: compile error — `DictionaryStorage` does not exist.

- [ ] **Step 3: Implement**

Create `server/TypeLab.Api/Data/DictionaryStorage.cs`:

```csharp
namespace TypeLab.Api.Data;

/// <summary>
/// Where downloaded dictionaries live: a sibling of the model directory under
/// the same configurable root, so one volume mount covers both.
///
/// Deliberately not nested under models/: a dictionary is not a model, and
/// <see cref="ModelStorage.UsedBytes"/> reports the figure shown on the Models
/// page. Nesting would inflate it by tens of megabytes of dictionary data.
/// </summary>
public sealed class DictionaryStorage
{
    public string Root { get; }

    public DictionaryStorage(ModelStorage models)
    {
        var parent = Path.GetDirectoryName(models.Root)
            ?? throw new InvalidOperationException($"model root has no parent: {models.Root}");

        Root = Path.Combine(parent, "dictionaries");
    }

    public string PathFor(string code) => Path.Combine(Root, code);

    public bool Exists => Directory.Exists(Root);

    public long UsedBytes()
    {
        if (!Exists) return 0;
        return new DirectoryInfo(Root).EnumerateFiles("*", SearchOption.AllDirectories).Sum(f => f.Length);
    }

    public bool EnsureWritable()
    {
        try
        {
            Directory.CreateDirectory(Root);
            var probe = Path.Combine(Root, ".write-probe");
            File.WriteAllText(probe, string.Empty);
            File.Delete(probe);
            return true;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            return false;
        }
    }
}
```

- [ ] **Step 4: Run tests**

Run: `dotnet test server/TypeLab.slnx --filter FullyQualifiedName~DictionaryStorageTests`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add server/TypeLab.Api/Data/DictionaryStorage.cs server/TypeLab.Api.Tests/DictionaryStorageTests.cs
git commit -m "Resolve the dictionary directory beside the model one"
```

---

### Task 3: ECDICT parser

**Files:**

- Create: `server/TypeLab.Api/Import/EcdictParser.cs`
- Modify: `server/TypeLab.Api/TypeLab.Api.csproj` (add CsvHelper)
- Test: `server/TypeLab.Api.Tests/EcdictParserTests.cs`

**Interfaces:**

- Consumes: `Word` entity (existing) — properties `Text`, `Phonetic`, `Pos`, `Zh`, `Topic`, `Freq`.
- Produces: `EcdictParser.Parse(TextReader) → IEnumerable<ParsedWord>` and `record ParsedWord(Word Word, bool Malformed)`.

- [ ] **Step 1: Add CsvHelper**

Run:

```bash
dotnet add server/TypeLab.Api/TypeLab.Api.csproj package CsvHelper
```

Rationale to record in the commit: ECDICT's `translation` column contains commas and embedded newlines inside quoted fields. `string.Split(',')` corrupts roughly 40% of rows. RFC 4180 quoting is not worth hand-rolling.

- [ ] **Step 2: Write the failing test**

Create `server/TypeLab.Api.Tests/EcdictParserTests.cs`:

```csharp
using TypeLab.Api.Import;

namespace TypeLab.Api.Tests;

public class EcdictParserTests
{
    private const string Header = "word,phonetic,definition,translation,pos,collins,oxford,tag,bnc,frq,exchange,detail,audio";

    private static List<ParsedWord> Parse(string body)
    {
        using var reader = new StringReader(Header + "\n" + body);
        return EcdictParser.Parse(reader).ToList();
    }

    [Fact]
    public void Maps_the_columns_it_uses()
    {
        var rows = Parse("apple,'æpl,a fruit,蘋果,n,0,0,zk,1000,2500,,,\n");

        var w = Assert.Single(rows).Word;
        Assert.Equal("apple", w.Text);
        Assert.Equal("'æpl", w.Phonetic);
        Assert.Equal("蘋果", w.Zh);
        Assert.Equal("n", w.Pos);
        Assert.Equal("zk", w.Topic);
        Assert.Equal(2500, w.Freq);
    }

    /// <summary>A quoted comma must not split the row — this is why CsvHelper is used.</summary>
    [Fact]
    public void Keeps_a_quoted_comma_inside_the_field()
    {
        var rows = Parse("bank,bæŋk,a place,\"銀行, 河岸\",n,0,0,,,,,,\n");

        Assert.Equal("銀行, 河岸", Assert.Single(rows).Word.Zh);
    }

    [Fact]
    public void Keeps_a_quoted_newline_inside_the_field()
    {
        var rows = Parse("run,rʌn,to move,\"跑\n奔跑\",v,0,0,,,,,,\n");

        Assert.Single(rows);
        Assert.Contains("奔跑", rows[0].Word.Zh);
    }

    [Fact]
    public void Treats_an_empty_frequency_as_zero()
    {
        var rows = Parse("rare,rɛə,uncommon,罕見,adj,0,0,,,,,,\n");

        Assert.Equal(0, Assert.Single(rows).Word.Freq);
    }

    /// <summary>One bad line in 770k must not abort the import.</summary>
    [Fact]
    public void Flags_a_short_row_as_malformed_and_continues()
    {
        var rows = Parse("broken\ngood,gʊd,fine,好,adj,0,0,,,1,,,\n");

        Assert.Equal(2, rows.Count);
        Assert.True(rows[0].Malformed);
        Assert.False(rows[1].Malformed);
        Assert.Equal("good", rows[1].Word.Text);
    }

    [Fact]
    public void Skips_a_row_with_no_headword()
    {
        var rows = Parse(",,,無詞,,,,,,,,,\n");

        Assert.True(Assert.Single(rows).Malformed);
    }
}
```

- [ ] **Step 3: Run to verify it fails**

Run: `dotnet test server/TypeLab.slnx --filter FullyQualifiedName~EcdictParserTests`
Expected: compile error — `EcdictParser` does not exist.

- [ ] **Step 4: Implement**

Create `server/TypeLab.Api/Import/EcdictParser.cs`:

```csharp
using System.Globalization;
using CsvHelper;
using CsvHelper.Configuration;
using TypeLab.Api.Models;

namespace TypeLab.Api.Import;

/// <summary>A parsed row; malformed ones are reported rather than thrown.</summary>
public record ParsedWord(Word Word, bool Malformed);

/// <summary>
/// ECDICT's CSV export. Streams: the file is roughly 770k rows and must never
/// be materialised whole.
/// </summary>
public static class EcdictParser
{
    public static IEnumerable<ParsedWord> Parse(TextReader reader)
    {
        var config = new CsvConfiguration(CultureInfo.InvariantCulture)
        {
            // The file has rows with fewer columns than the header; they are
            // reported as malformed rather than aborting the run.
            MissingFieldFound = null,
            BadDataFound = null,
            HasHeaderRecord = true,
        };

        using var csv = new CsvReader(reader, config);
        csv.Read();
        csv.ReadHeader();

        while (csv.Read())
        {
            var text = csv.GetField("word")?.Trim() ?? string.Empty;
            if (text.Length == 0)
            {
                yield return new ParsedWord(new Word(), Malformed: true);
                continue;
            }

            var word = new Word
            {
                Text = text,
                Phonetic = NullIfEmpty(csv.GetField("phonetic")),
                Pos = NullIfEmpty(csv.GetField("pos")),
                Zh = NullIfEmpty(csv.GetField("translation")),
                Topic = NullIfEmpty(csv.GetField("tag")),
                Freq = ParseFreq(csv.GetField("frq")),
            };

            yield return new ParsedWord(word, Malformed: false);
        }
    }

    private static string? NullIfEmpty(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static int ParseFreq(string? value) =>
        int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var n) ? n : 0;
}
```

- [ ] **Step 5: Run tests**

Run: `dotnet test server/TypeLab.slnx --filter FullyQualifiedName~EcdictParserTests`
Expected: PASS, 6 tests.

If `Flags_a_short_row_as_malformed_and_continues` fails because CsvHelper throws on the ragged row, confirm `MissingFieldFound = null` and `BadDataFound = null` are both set — those two suppress the exceptions and let the row reach the headword check.

- [ ] **Step 6: Commit**

```bash
git add server/TypeLab.Api/Import/EcdictParser.cs server/TypeLab.Api/TypeLab.Api.csproj server/TypeLab.Api.Tests/EcdictParserTests.cs
git commit -m "Parse ECDICT rows, honouring quoted commas and newlines"
```

---

### Task 4: CC-CEDICT parser

**Files:**

- Create: `server/TypeLab.Api/Import/CcCedictParser.cs`
- Test: `server/TypeLab.Api.Tests/CcCedictParserTests.cs`

**Interfaces:**

- Consumes: `ParsedWord` from Task 3.
- Produces: `CcCedictParser.Parse(TextReader) → IEnumerable<ParsedWord>`.

- [ ] **Step 1: Write the failing test**

Create `server/TypeLab.Api.Tests/CcCedictParserTests.cs`:

```csharp
using TypeLab.Api.Import;

namespace TypeLab.Api.Tests;

public class CcCedictParserTests
{
    private static List<ParsedWord> Parse(string body)
    {
        using var reader = new StringReader(body);
        return CcCedictParser.Parse(reader).ToList();
    }

    [Fact]
    public void Maps_traditional_simplified_pinyin_and_glosses()
    {
        var rows = Parse("漢字 汉字 [han4 zi4] /Chinese character/\n");

        var w = Assert.Single(rows).Word;
        Assert.Equal("漢字", w.Text);
        Assert.Equal("汉字", w.Zh);
        Assert.Equal("han4 zi4", w.Phonetic);
        Assert.Equal("Chinese character", w.Topic);
    }

    [Fact]
    public void Joins_multiple_glosses()
    {
        var rows = Parse("行 行 [xing2] /to walk/to go/OK/\n");

        Assert.Equal("to walk; to go; OK", Assert.Single(rows).Word.Topic);
    }

    [Fact]
    public void Skips_comment_and_blank_lines()
    {
        var rows = Parse("# comment\n\n漢字 汉字 [han4 zi4] /Chinese character/\n");

        Assert.Single(rows);
    }

    [Fact]
    public void Flags_a_line_without_pinyin_brackets()
    {
        var rows = Parse("漢字 汉字 /Chinese character/\n");

        Assert.True(Assert.Single(rows).Malformed);
    }

    [Fact]
    public void Flags_a_line_without_glosses()
    {
        var rows = Parse("漢字 汉字 [han4 zi4]\n");

        Assert.True(Assert.Single(rows).Malformed);
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `dotnet test server/TypeLab.slnx --filter FullyQualifiedName~CcCedictParserTests`
Expected: compile error — `CcCedictParser` does not exist.

- [ ] **Step 3: Implement**

Create `server/TypeLab.Api/Import/CcCedictParser.cs`:

```csharp
using System.Text.RegularExpressions;
using TypeLab.Api.Models;

namespace TypeLab.Api.Import;

/// <summary>
/// CC-CEDICT's line format:
///
///     繁體 简体 [pin1 yin1] /gloss one/gloss two/
///
/// The headword is the traditional form, and the glosses are English, so this
/// source reads Chinese-to-English — the opposite direction from ECDICT.
/// </summary>
public static partial class CcCedictParser
{
    [GeneratedRegex(@"^(?<trad>\S+)\s+(?<simp>\S+)\s+\[(?<pinyin>[^\]]*)\]\s+/(?<glosses>.+)/\s*$")]
    private static partial Regex LineFormat();

    public static IEnumerable<ParsedWord> Parse(TextReader reader)
    {
        while (reader.ReadLine() is { } line)
        {
            if (line.Length == 0 || line.StartsWith('#')) continue;

            var match = LineFormat().Match(line);
            if (!match.Success)
            {
                yield return new ParsedWord(new Word(), Malformed: true);
                continue;
            }

            var glosses = match.Groups["glosses"].Value
                .Split('/', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

            yield return new ParsedWord(
                new Word
                {
                    Text = match.Groups["trad"].Value,
                    Zh = match.Groups["simp"].Value,
                    Phonetic = match.Groups["pinyin"].Value,
                    Topic = string.Join("; ", glosses),
                    Freq = 0,
                },
                Malformed: false);
        }
    }
}
```

- [ ] **Step 4: Run tests**

Run: `dotnet test server/TypeLab.slnx --filter FullyQualifiedName~CcCedictParserTests`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add server/TypeLab.Api/Import/CcCedictParser.cs server/TypeLab.Api.Tests/CcCedictParserTests.cs
git commit -m "Parse CC-CEDICT lines"
```

---

### Task 5: Batched import with dedupe

**Files:**

- Create: `server/TypeLab.Api/Import/WordImporter.cs`
- Test: `server/TypeLab.Api.Tests/WordImporterTests.cs`

**Interfaces:**

- Consumes: `ParsedWord` (Task 3); `Word`, `UserWordMastery` entities (existing).
- Produces: `WordImporter.Import(ISqlSugarClient, IEnumerable<ParsedWord>, bool reuseMastery) → ImportResult`, and `record ImportResult(int Inserted, int Updated, int Skipped)`.

- [ ] **Step 1: Write the failing test**

Create `server/TypeLab.Api.Tests/WordImporterTests.cs`:

```csharp
using SqlSugar;
using TypeLab.Api.Import;
using TypeLab.Api.Models;

namespace TypeLab.Api.Tests;

public class WordImporterTests
{
    private static ParsedWord Ok(string text, string? zh = null) =>
        new(new Word { Text = text, Zh = zh }, Malformed: false);

    [Fact]
    public void Inserts_new_words()
    {
        using var db = new TestDb();

        var result = WordImporter.Import(db.Db, [Ok("apple", "蘋果"), Ok("bank", "銀行")], reuseMastery: true);

        Assert.Equal(2, result.Inserted);
        Assert.Equal(2, db.Db.Queryable<Word>().Count());
    }

    [Fact]
    public void Counts_malformed_rows_as_skipped_without_inserting_them()
    {
        using var db = new TestDb();

        var result = WordImporter.Import(
            db.Db,
            [Ok("apple"), new ParsedWord(new Word(), Malformed: true)],
            reuseMastery: true);

        Assert.Equal(1, result.Inserted);
        Assert.Equal(1, result.Skipped);
        Assert.Equal(1, db.Db.Queryable<Word>().Count());
    }

    /// <summary>
    /// Mastery is the user's own progress, not imported data. Re-importing a
    /// dictionary must never discard it.
    /// </summary>
    [Fact]
    public void Keeps_existing_mastery_when_a_word_is_reimported()
    {
        using var db = new TestDb();
        WordImporter.Import(db.Db, [Ok("apple", "蘋果")], reuseMastery: true);

        var word = db.Db.Queryable<Word>().First(w => w.Text == "apple");
        db.Db.Insertable(new UserWordMastery { UserId = 1, WordId = word.Id, Mastery = 80 }).ExecuteCommand();

        var result = WordImporter.Import(db.Db, [Ok("apple", "蘋果（更新）")], reuseMastery: true);

        Assert.Equal(1, result.Updated);
        Assert.Equal(1, db.Db.Queryable<Word>().Count());
        Assert.Equal(80, db.Db.Queryable<UserWordMastery>().First(m => m.WordId == word.Id).Mastery);
        Assert.Equal("蘋果（更新）", db.Db.Queryable<Word>().First(w => w.Text == "apple").Zh);
    }

    [Fact]
    public void Leaves_the_existing_definition_alone_when_reuse_is_off()
    {
        using var db = new TestDb();
        WordImporter.Import(db.Db, [Ok("apple", "蘋果")], reuseMastery: false);

        var result = WordImporter.Import(db.Db, [Ok("apple", "別的")], reuseMastery: false);

        Assert.Equal(1, result.Skipped);
        Assert.Equal("蘋果", db.Db.Queryable<Word>().First(w => w.Text == "apple").Zh);
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `dotnet test server/TypeLab.slnx --filter FullyQualifiedName~WordImporterTests`
Expected: compile error — `WordImporter` does not exist.

- [ ] **Step 3: Implement**

Create `server/TypeLab.Api/Import/WordImporter.cs`:

```csharp
using SqlSugar;
using TypeLab.Api.Models;

namespace TypeLab.Api.Import;

public record ImportResult(int Inserted, int Updated, int Skipped);

/// <summary>
/// Writes parsed rows into <see cref="Word"/> in batches.
///
/// <see cref="UserWordMastery"/> is never touched: it records the user's own
/// progress against a word, not anything the dictionary supplies, so a
/// re-import updates the definition and leaves mastery standing.
/// </summary>
public static class WordImporter
{
    private const int BatchSize = 1000;

    public static ImportResult Import(
        ISqlSugarClient db,
        IEnumerable<ParsedWord> rows,
        bool reuseMastery)
    {
        var inserted = 0;
        var updated = 0;
        var skipped = 0;
        var pending = new List<Word>(BatchSize);

        foreach (var row in rows)
        {
            if (row.Malformed || row.Word.Text.Length == 0)
            {
                skipped++;
                continue;
            }

            var existing = db.Queryable<Word>().First(w => w.Text == row.Word.Text);
            if (existing is null)
            {
                pending.Add(row.Word);
                inserted++;

                if (pending.Count >= BatchSize)
                {
                    db.Insertable(pending).ExecuteCommand();
                    pending.Clear();
                }
                continue;
            }

            if (!reuseMastery)
            {
                // The toggle is off: the existing entry wins outright.
                skipped++;
                continue;
            }

            existing.Zh = row.Word.Zh;
            existing.Phonetic = row.Word.Phonetic;
            existing.Pos = row.Word.Pos;
            existing.Topic = row.Word.Topic;
            existing.Freq = row.Word.Freq;
            db.Updateable(existing).ExecuteCommand();
            updated++;
        }

        if (pending.Count > 0) db.Insertable(pending).ExecuteCommand();

        return new ImportResult(inserted, updated, skipped);
    }
}
```

- [ ] **Step 4: Run tests**

Run: `dotnet test server/TypeLab.slnx --filter FullyQualifiedName~WordImporterTests`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add server/TypeLab.Api/Import/WordImporter.cs server/TypeLab.Api.Tests/WordImporterTests.cs
git commit -m "Import parsed words in batches, preserving mastery"
```

---

### Task 6: Downloader and job state

**Files:**

- Create: `server/TypeLab.Api/Import/DictionaryDownloader.cs`
- Test: `server/TypeLab.Api.Tests/DictionaryDownloaderTests.cs`

**Interfaces:**

- Consumes: `DictionaryStorage` (Task 2); `DictionarySource` (Task 1); `EcdictParser`, `CcCedictParser` (Tasks 3–4); `WordImporter` (Task 5).
- Produces: `DictionaryDownloader` with `Start(DictionarySource, bool reuseMastery) → string jobId`, `Status(string code) → DownloadStatus`, and `record DownloadStatus(string State, double ReceivedMb, double TotalMb, int Percent, string? Error)`.

- [ ] **Step 1: Write the failing test**

Create `server/TypeLab.Api.Tests/DictionaryDownloaderTests.cs`:

```csharp
using TypeLab.Api.Import;

namespace TypeLab.Api.Tests;

public class DictionaryDownloaderTests
{
    [Fact]
    public void Unknown_code_reports_idle()
    {
        var downloader = new DictionaryDownloader();

        var status = downloader.Status("never-started");

        Assert.Equal("idle", status.State);
        Assert.Equal(0, status.Percent);
    }

    [Fact]
    public void Percent_is_derived_from_the_byte_counts()
    {
        var downloader = new DictionaryDownloader();

        downloader.Report("ecdict", state: "downloading", received: 5 * 1024 * 1024, total: 20 * 1024 * 1024);

        var status = downloader.Status("ecdict");
        Assert.Equal("downloading", status.State);
        Assert.Equal(25, status.Percent);
        Assert.Equal(5, status.ReceivedMb);
    }

    /// <summary>A server that sends no Content-Length must not produce a divide-by-zero.</summary>
    [Fact]
    public void Percent_is_zero_when_the_total_is_unknown()
    {
        var downloader = new DictionaryDownloader();

        downloader.Report("ecdict", state: "downloading", received: 1024, total: 0);

        Assert.Equal(0, downloader.Status("ecdict").Percent);
    }

    [Fact]
    public void A_failure_records_the_message_and_stops_reporting_progress()
    {
        var downloader = new DictionaryDownloader();
        downloader.Report("ecdict", state: "downloading", received: 10, total: 100);

        downloader.Fail("ecdict", "HTTP 404 for https://example.invalid/x.csv");

        var status = downloader.Status("ecdict");
        Assert.Equal("failed", status.State);
        Assert.Contains("404", status.Error);
    }

    [Fact]
    public void Running_reports_true_only_while_a_job_is_active()
    {
        var downloader = new DictionaryDownloader();

        Assert.False(downloader.IsRunning("ecdict"));
        downloader.Report("ecdict", state: "downloading", received: 0, total: 100);
        Assert.True(downloader.IsRunning("ecdict"));
        downloader.Report("ecdict", state: "installed", received: 100, total: 100);
        Assert.False(downloader.IsRunning("ecdict"));
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `dotnet test server/TypeLab.slnx --filter FullyQualifiedName~DictionaryDownloaderTests`
Expected: compile error — `DictionaryDownloader` does not exist.

- [ ] **Step 3: Implement the state container**

Create `server/TypeLab.Api/Import/DictionaryDownloader.cs`:

```csharp
using System.Collections.Concurrent;
using System.IO.Compression;
using SqlSugar;
using TypeLab.Api.Data;
using TypeLab.Api.Models;

namespace TypeLab.Api.Import;

public record DownloadStatus(string State, double ReceivedMb, double TotalMb, int Percent, string? Error);

/// <summary>
/// Fetches a dictionary in the background and imports it.
///
/// Registered as a singleton: job state lives in memory and is deliberately not
/// persisted. An interrupted process loses the progress bar, not the data — a
/// half-downloaded file is deleted and the user starts again, which is simpler
/// than resumable range requests for files of tens of megabytes.
/// </summary>
public sealed class DictionaryDownloader
{
    private sealed record Job(string State, long Received, long Total, string? Error);

    private readonly ConcurrentDictionary<string, Job> _jobs = new();

    private static readonly string[] ActiveStates = ["downloading", "importing"];

    public bool IsRunning(string code) =>
        _jobs.TryGetValue(code, out var job) && ActiveStates.Contains(job.State);

    public DownloadStatus Status(string code)
    {
        if (!_jobs.TryGetValue(code, out var job))
            return new DownloadStatus("idle", 0, 0, 0, null);

        var percent = job.Total > 0 ? (int)(job.Received * 100 / job.Total) : 0;
        return new DownloadStatus(
            job.State,
            Math.Round(job.Received / 1024d / 1024d, 1),
            Math.Round(job.Total / 1024d / 1024d, 1),
            percent,
            job.Error);
    }

    /// <summary>Visible for testing and used by the download loop.</summary>
    public void Report(string code, string state, long received, long total) =>
        _jobs[code] = new Job(state, received, total, null);

    public void Fail(string code, string error)
    {
        var previous = _jobs.TryGetValue(code, out var job) ? job : new Job("failed", 0, 0, null);
        _jobs[code] = previous with { State = "failed", Error = error };
    }
}
```

- [ ] **Step 4: Run tests**

Run: `dotnet test server/TypeLab.slnx --filter FullyQualifiedName~DictionaryDownloaderTests`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add the fetch-and-import loop**

Append to `DictionaryDownloader`, inside the class:

```csharp
    /// <summary>
    /// Kicks off the fetch. Returns immediately: the caller polls
    /// <see cref="Status"/>, because holding a request open for tens of
    /// megabytes serves nobody.
    /// </summary>
    public string Start(
        IServiceScopeFactory scopes,
        DictionarySource source,
        bool reuseMastery)
    {
        var jobId = Guid.NewGuid().ToString("N");
        Report(source.Code, "downloading", 0, 0);

        _ = Task.Run(() => RunAsync(scopes, source, reuseMastery));

        return jobId;
    }

    private async Task RunAsync(IServiceScopeFactory scopes, DictionarySource source, bool reuseMastery)
    {
        using var scope = scopes.CreateScope();
        var storage = scope.ServiceProvider.GetRequiredService<DictionaryStorage>();
        var db = scope.ServiceProvider.GetRequiredService<ISqlSugarClient>();
        var http = scope.ServiceProvider.GetRequiredService<IHttpClientFactory>().CreateClient();

        var folder = storage.PathFor(source.Code);
        var file = Path.Combine(folder, Path.GetFileName(new Uri(source.SourceUrl).LocalPath));

        try
        {
            Directory.CreateDirectory(folder);

            using var response = await http.GetAsync(source.SourceUrl, HttpCompletionOption.ResponseHeadersRead);
            if (!response.IsSuccessStatusCode)
            {
                // Name the URL: these are seeded and can rot.
                Fail(source.Code, $"HTTP {(int)response.StatusCode} for {source.SourceUrl}");
                return;
            }

            var total = response.Content.Headers.ContentLength ?? 0;
            await using (var incoming = await response.Content.ReadAsStreamAsync())
            await using (var target = File.Create(file))
            {
                var buffer = new byte[81920];
                long received = 0;
                int read;
                while ((read = await incoming.ReadAsync(buffer)) > 0)
                {
                    await target.WriteAsync(buffer.AsMemory(0, read));
                    received += read;
                    Report(source.Code, "downloading", received, total);
                }
            }

            Report(source.Code, "importing", total, total);

            using var reader = OpenText(file, source.Compression);
            var rows = source.Format switch
            {
                "ecdict-csv" => EcdictParser.Parse(reader),
                "cc-cedict" => CcCedictParser.Parse(reader),
                _ => throw new NotSupportedException($"no parser for format {source.Format}"),
            };

            var result = WordImporter.Import(db, rows, reuseMastery);

            source.Installed = true;
            source.InstalledAt = DateTime.UtcNow;
            source.EntryCount = result.Inserted + result.Updated;
            db.Updateable(source).ExecuteCommand();

            Report(source.Code, "installed", total, total);
        }
        catch (Exception ex)
        {
            // A partial file would be parsed as truncated data on the next run.
            if (File.Exists(file)) File.Delete(file);
            Fail(source.Code, ex.Message);
        }
    }

    private static StreamReader OpenText(string path, string? compression)
    {
        var stream = File.OpenRead(path);
        return compression == "gzip"
            ? new StreamReader(new GZipStream(stream, CompressionMode.Decompress))
            : new StreamReader(stream);
    }
```

- [ ] **Step 6: Run the whole server suite**

Run: `dotnet test server/TypeLab.slnx`
Expected: PASS, everything green.

- [ ] **Step 7: Commit**

```bash
git add server/TypeLab.Api/Import/DictionaryDownloader.cs server/TypeLab.Api.Tests/DictionaryDownloaderTests.cs
git commit -m "Fetch and import a dictionary in the background"
```

---

### Task 7: Endpoints

**Files:**

- Create: `server/TypeLab.Api/Api/DictionaryEndpoints.cs`
- Modify: `server/TypeLab.Api/Program.cs`
- Modify: `server/TypeLab.Api/Data/CatalogueTranslationSeeds.cs`
- Test: `server/TypeLab.Api.Tests/DictionaryCatalogueTranslationTests.cs`

**Interfaces:**

- Consumes: `DictionaryDownloader` (Task 6); `DictionaryStorage` (Task 2); `CatalogueLocalizer` (existing) — `ResolveLocale(string?, string?)`, `Load(ISqlSugarClient, string, IReadOnlyCollection<int>, string)`, `Pick(map, int, string, string)`.
- Produces: routes under `/api/dictionaries`; `CatalogueTranslationSeeds.DictionaryEntity` constant.

- [ ] **Step 1: Write the failing test for catalogue translations**

Create `server/TypeLab.Api.Tests/DictionaryCatalogueTranslationTests.cs`:

```csharp
using SqlSugar;
using TypeLab.Api.Data;
using TypeLab.Api.Models;

namespace TypeLab.Api.Tests;

public class DictionaryCatalogueTranslationTests
{
    [Fact]
    public void Seeds_traditional_and_simplified_descriptions()
    {
        using var db = new TestDb();
        DictionarySourceSeeds.Seed(db.Db);
        CatalogueTranslationSeeds.Seed(db.Db);

        var ecdict = db.Db.Queryable<DictionarySource>().First(s => s.Code == "ecdict");
        var tw = CatalogueLocalizer.Load(db.Db, CatalogueTranslationSeeds.DictionaryEntity, [ecdict.Id], "zh-TW");
        var cn = CatalogueLocalizer.Load(db.Db, CatalogueTranslationSeeds.DictionaryEntity, [ecdict.Id], "zh-CN");

        Assert.NotEqual(
            CatalogueLocalizer.Pick(tw, ecdict.Id, "Description", ecdict.Description),
            ecdict.Description);
        Assert.NotEqual(
            CatalogueLocalizer.Pick(tw, ecdict.Id, "Description", ""),
            CatalogueLocalizer.Pick(cn, ecdict.Id, "Description", ""));
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `dotnet test server/TypeLab.slnx --filter FullyQualifiedName~DictionaryCatalogueTranslationTests`
Expected: compile error — `CatalogueTranslationSeeds.DictionaryEntity` does not exist.

- [ ] **Step 3: Extend the catalogue translations**

In `server/TypeLab.Api/Data/CatalogueTranslationSeeds.cs`, add beside the existing entity constants:

```csharp
    public const string DictionaryEntity = "DictionarySources";
```

Add the copy table beside `ModelNotes`:

```csharp
    public static readonly Dictionary<string, LocalizedText> DictionaryDescriptions = new()
    {
        ["ecdict"] = new("英中對照，約 77 萬筆，含詞頻標籤", "英中对照，约 77 万条，含词频标签"),
        ["cc-cedict"] = new("中英對照，適合中翻英方向", "中英对照，适合中译英方向"),
        ["wordnet"] = new("英文語意資料庫，用於補齊缺少的例句", "英文语义数据库，用于补齐缺少的例句"),
    };
```

Add the seeding method and call it from `Seed`:

```csharp
    private static void SeedDictionaries(ISqlSugarClient db)
    {
        var rows = db.Queryable<DictionarySource>().ToList();
        foreach (var row in rows)
        {
            if (!DictionaryDescriptions.TryGetValue(row.Code, out var copy)) continue;

            Upsert(db, DictionaryEntity, row.Id, "Description", "en", row.Description);
            Upsert(db, DictionaryEntity, row.Id, "Description", "zh-TW", copy.ZhTw);
            Upsert(db, DictionaryEntity, row.Id, "Description", "zh-CN", copy.ZhCn);
        }
    }
```

In `Seed`, after `SeedModels(db);`:

```csharp
        SeedDictionaries(db);
```

In `SqlSugarSetup.InitDatabase`, `DictionarySourceSeeds.Seed(db)` must run **before** `CatalogueTranslationSeeds.Seed(db)` — the translations key off the rows' ids.

- [ ] **Step 4: Run the test**

Run: `dotnet test server/TypeLab.slnx --filter FullyQualifiedName~DictionaryCatalogueTranslationTests`
Expected: PASS.

- [ ] **Step 5: Write the endpoints**

Create `server/TypeLab.Api/Api/DictionaryEndpoints.cs`:

```csharp
using SqlSugar;
using TypeLab.Api.Data;
using TypeLab.Api.Import;
using TypeLab.Api.Models;

namespace TypeLab.Api.Api;

/// <summary>
/// The dictionary catalogue and its downloads.
///
/// Downloads run in the background and progress is polled: a once-per-install
/// progress bar does not justify a streaming transport.
/// </summary>
public static class DictionaryEndpoints
{
    public record DictionarySourceDto(
        string Code,
        string Name,
        string Description,
        string Licence,
        string HomepageUrl,
        int ApproxEntries,
        bool SupportsImport,
        bool Installed,
        int EntryCount);

    public record DictionaryStorageDto(
        string Directory,
        bool Writable,
        double UsedMb,
        IReadOnlyList<DictionarySourceDto> Sources);

    public record DownloadRequest(bool ReuseMastery);

    public static RouteGroupBuilder MapDictionaries(this IEndpointRouteBuilder app, string prefix = "/dictionaries")
    {
        var group = app.MapGroup(prefix).WithTags("Dictionaries");

        group.MapGet("/", async (
            ISqlSugarClient db,
            DictionaryStorage storage,
            HttpRequest request,
            string? locale) =>
        {
            var tag = CatalogueLocalizer.ResolveLocale(locale, request.Headers.AcceptLanguage);
            var rows = await db.Queryable<DictionarySource>().OrderBy(s => s.SortOrder).ToListAsync();
            var copy = CatalogueLocalizer.Load(db, CatalogueTranslationSeeds.DictionaryEntity,
                rows.Select(r => r.Id).ToList(), tag);

            return Results.Ok(new DictionaryStorageDto(
                storage.Root,
                storage.EnsureWritable(),
                Math.Round(storage.UsedBytes() / 1024d / 1024d, 2),
                rows.Select(s => new DictionarySourceDto(
                    s.Code,
                    s.Name,
                    CatalogueLocalizer.Pick(copy, s.Id, "Description", s.Description),
                    s.Licence,
                    s.HomepageUrl,
                    s.ApproxEntries,
                    s.SupportsImport,
                    s.Installed,
                    s.EntryCount)).ToList()));
        })
        .WithName("GetDictionaries");

        group.MapPost("/{code}/download", async (
            ISqlSugarClient db,
            DictionaryDownloader downloader,
            DictionaryStorage storage,
            IServiceScopeFactory scopes,
            string code,
            DownloadRequest? body) =>
        {
            var source = await db.Queryable<DictionarySource>().Where(s => s.Code == code).FirstAsync();
            if (source is null) return Results.NotFound();

            if (!source.SupportsImport)
                return Results.BadRequest(new { message = $"{source.Name} cannot be imported; see {source.HomepageUrl}." });

            if (downloader.IsRunning(code))
                return Results.Conflict(new { message = "A download for this source is already running." });

            // Checked before the fetch, not after it fails on the last byte.
            if (!storage.EnsureWritable())
                return Results.Problem($"Cannot write to {storage.Root}.");

            var jobId = downloader.Start(scopes, source, body?.ReuseMastery ?? true);
            return Results.Accepted($"/api/dictionaries/{code}/status", new { jobId });
        })
        .WithName("StartDictionaryDownload");

        group.MapGet("/{code}/status", (DictionaryDownloader downloader, string code) =>
            Results.Ok(downloader.Status(code)))
            .WithName("GetDictionaryDownloadStatus");

        group.MapDelete("/{code}", async (
            ISqlSugarClient db,
            DictionaryStorage storage,
            string code) =>
        {
            var source = await db.Queryable<DictionarySource>().Where(s => s.Code == code).FirstAsync();
            if (source is null) return Results.NotFound();

            var folder = storage.PathFor(code);
            if (Directory.Exists(folder)) Directory.Delete(folder, recursive: true);

            source.Installed = false;
            source.InstalledAt = null;
            source.EntryCount = 0;
            await db.Updateable(source).ExecuteCommandAsync();

            return Results.NoContent();
        })
        .WithName("RemoveDictionary");

        return group;
    }
}
```

- [ ] **Step 6: Register in Program.cs**

Add to the service registrations, after `builder.Services.AddSingleton<ModelStorage>();`:

```csharp
builder.Services.AddSingleton<DictionaryStorage>();
builder.Services.AddSingleton<DictionaryDownloader>();
builder.Services.AddHttpClient();
```

Add to the route mappings, after `api.MapModels();`:

```csharp
api.MapDictionaries();
```

- [ ] **Step 7: Verify the server starts and the route answers**

Run in one terminal:

```bash
dotnet run --project server/TypeLab.Api --launch-profile http
```

In another:

```bash
curl http://localhost:5001/api/dictionaries
curl "http://localhost:5001/api/dictionaries?locale=zh-TW"
```

Expected: three sources; the second call returns Chinese descriptions. Stop the server afterwards.

- [ ] **Step 8: Commit**

```bash
git add server/TypeLab.Api/Api/DictionaryEndpoints.cs server/TypeLab.Api/Program.cs server/TypeLab.Api/Data/CatalogueTranslationSeeds.cs server/TypeLab.Api.Tests/DictionaryCatalogueTranslationTests.cs
git commit -m "Serve the dictionary catalogue and its downloads"
```

---

### Task 8: Front-end API layer and store

**Files:**

- Modify: `apps/src/api/types.ts`
- Modify: `apps/src/api/index.ts`
- Modify: `apps/src/api/mock/fixtures.ts`
- Modify: `apps/src/stores/dictionary.ts`
- Test: `apps/src/stores/dictionary.sources.test.ts`

**Interfaces:**

- Consumes: `pick(mock, real)` from `apps/src/api/index.ts` (existing private helper); `http` from `./http`.
- Produces: `api.dictionaries.list(locale?)`, `api.dictionaries.download(code, reuseMastery)`, `api.dictionaries.status(code)`, `api.dictionaries.remove(code)`; store members `sources`, `sourcesLoaded`, `loadSources()`, `download(code)`, `remove(code)`.

- [ ] **Step 1: Add the wire types**

Append to `apps/src/api/types.ts`:

```typescript
export interface DictionarySourceDto {
  code: string
  name: string
  description: string
  licence: string
  homepageUrl: string
  approxEntries: number
  supportsImport: boolean
  installed: boolean
  entryCount: number
}

export interface DictionaryStorageDto {
  directory: string
  writable: boolean
  usedMb: number
  sources: DictionarySourceDto[]
}

export interface DownloadStatusDto {
  state: 'idle' | 'downloading' | 'importing' | 'installed' | 'failed'
  receivedMb: number
  totalMb: number
  percent: number
  error: string | null
}
```

- [ ] **Step 2: Write the failing store test**

Create `apps/src/stores/dictionary.sources.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useDictionaryStore } from './dictionary'
import { api } from '@/api'

describe('dictionary sources', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.restoreAllMocks()
  })

  it('exposes the licence and homepage so attribution is visible before install', async () => {
    const store = useDictionaryStore()

    await store.loadSources()

    const cedict = store.sources.find((s) => s.code === 'cc-cedict')
    expect(cedict?.licence).toBe('CC BY-SA 4.0')
    expect(cedict?.homepageUrl).toMatch(/^https:\/\//)
  })

  it('marks a source installed optimistically', async () => {
    const store = useDictionaryStore()
    await store.loadSources()
    vi.spyOn(api.dictionaries, 'download').mockResolvedValue({ jobId: 'x' })
    vi.spyOn(api.dictionaries, 'status').mockResolvedValue({
      state: 'installed',
      receivedMb: 1,
      totalMb: 1,
      percent: 100,
      error: null,
    })

    await store.download('ecdict')

    expect(store.sources.find((s) => s.code === 'ecdict')?.installed).toBe(true)
  })

  it('rolls the flag back when the download fails', async () => {
    const store = useDictionaryStore()
    await store.loadSources()
    vi.spyOn(api.dictionaries, 'download').mockRejectedValue(new Error('boom'))

    await store.download('ecdict')

    expect(store.sources.find((s) => s.code === 'ecdict')?.installed).toBe(false)
    expect(store.downloadError).toBe('boom')
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm run test -- dictionary.sources`
Expected: FAIL — `loadSources` is not a function.

- [ ] **Step 4: Add the fixture**

Append to `apps/src/api/mock/fixtures.ts`:

```typescript
/**
 * Mirrors GET /dictionaries. Downloading is simulated under VITE_USE_MOCK:
 * there is no server to import into.
 */
export const dictionarySources = (): DictionaryStorageDto => ({
  directory: '~/TypeLab/dictionaries',
  writable: true,
  usedMb: 0,
  sources: [
    {
      code: 'ecdict',
      name: 'ECDICT',
      description: 'English–Chinese, about 770k entries, with frequency tags',
      licence: 'MIT',
      homepageUrl: 'https://github.com/skywind3000/ECDICT',
      approxEntries: 770000,
      supportsImport: true,
      installed: false,
      entryCount: 0,
    },
    {
      code: 'cc-cedict',
      name: 'CC-CEDICT',
      description: 'Chinese–English, suited to the Chinese-to-English direction',
      licence: 'CC BY-SA 4.0',
      homepageUrl: 'https://www.mdbg.net/chinese/dictionary?page=cc-cedict',
      approxEntries: 120000,
      supportsImport: true,
      installed: false,
      entryCount: 0,
    },
    {
      code: 'wordnet',
      name: 'WordNet',
      description: 'English lexical database, for filling in missing example sentences',
      licence: 'WordNet',
      homepageUrl: 'https://wordnet.princeton.edu/download/current-version',
      approxEntries: 155000,
      supportsImport: false,
      installed: false,
      entryCount: 0,
    },
  ],
})
```

Add `DictionaryStorageDto` to the existing `import type { … } from '../types'` block.

- [ ] **Step 5: Add the API methods**

In `apps/src/api/index.ts`, add `DictionaryStorageDto` and `DownloadStatusDto` to the type import, then add after the `dictionary:` block:

```typescript
  dictionaries: {
    list: (locale?: string): Promise<DictionaryStorageDto> =>
      pick(
        () => fx.dictionarySources(),
        () => http.get<DictionaryStorageDto>('/dictionaries', { params: { locale } }),
      ),
    download: (code: string, reuseMastery = true): Promise<{ jobId: string }> =>
      pick(
        () => ({ jobId: 'mock' }),
        () => http.post<{ jobId: string }>(`/dictionaries/${code}/download`, { reuseMastery }),
      ),
    status: (code: string): Promise<DownloadStatusDto> =>
      pick(
        () => ({ state: 'installed' as const, receivedMb: 0, totalMb: 0, percent: 100, error: null }),
        () => http.get<DownloadStatusDto>(`/dictionaries/${code}/status`),
      ),
    remove: (code: string): Promise<void> =>
      pick(
        () => undefined,
        () => http.delete<void>(`/dictionaries/${code}`),
      ),
  },
```

- [ ] **Step 6: Extend the store**

In `apps/src/stores/dictionary.ts`, add to the imports:

```typescript
import type { DictionarySourceDto } from '@/api'
```

Add inside the store, after the existing `dedupe` ref:

```typescript
const sources = ref<DictionarySourceDto[]>([])
const sourcesLoaded = ref(false)
const downloadingCode = ref('')
const downloadPercent = ref(0)
const downloadError = ref('')

async function loadSources() {
  const storage = await api.dictionaries.list()
  sources.value = storage.sources
  sourcesLoaded.value = true
}

const setInstalled = (code: string, value: boolean) => {
  sources.value = sources.value.map((s) => (s.code === code ? { ...s, installed: value } : s))
}

/** Optimistic: flip the row, poll until the job settles, roll back on failure. */
async function download(code: string) {
  downloadError.value = ''
  downloadingCode.value = code
  downloadPercent.value = 0
  setInstalled(code, true)

  try {
    await api.dictionaries.download(code, dedupe.value)

    for (;;) {
      const status = await api.dictionaries.status(code)
      downloadPercent.value = status.percent
      if (status.state === 'installed') break
      if (status.state === 'failed') throw new Error(status.error || 'download failed')
      await new Promise((r) => setTimeout(r, 1000))
    }
  } catch (e) {
    setInstalled(code, false)
    downloadError.value = e instanceof Error ? e.message : String(e)
  } finally {
    downloadingCode.value = ''
  }
}

async function remove(code: string) {
  setInstalled(code, false)
  try {
    await api.dictionaries.remove(code)
  } catch {
    setInstalled(code, true)
  }
}
```

Add to the returned object:

```typescript
    sources,
    sourcesLoaded,
    downloadingCode,
    downloadPercent,
    downloadError,
    loadSources,
    download,
    remove,
```

- [ ] **Step 7: Run tests**

Run: `npm run test -- dictionary.sources`
Expected: PASS, 3 tests.

- [ ] **Step 8: Typecheck, format, commit**

```bash
npm run typecheck
npm run format
git add apps/src/api/types.ts apps/src/api/index.ts apps/src/api/mock/fixtures.ts apps/src/stores/dictionary.ts apps/src/stores/dictionary.sources.test.ts
git commit -m "Expose the dictionary catalogue to the front end"
```

---

### Task 9: Import dialog and docs

**Files:**

- Modify: `apps/src/views/DictionaryView.vue`
- Modify: `apps/src/i18n/locales/en.json`, `zh-TW.json`, `zh-CN.json`
- Modify: `docs/api-contract.md`

**Interfaces:**

- Consumes: store members from Task 8.
- Produces: no new interfaces.

- [ ] **Step 1: Add the i18n keys**

In `apps/src/i18n/locales/en.json`, under the existing `dictionary.import` object:

```json
      "download": "Download",
      "downloading": "Downloading… {percent}%",
      "installed": "Installed",
      "entries": "{count} entries",
      "licence": "Licence",
      "viewSource": "View source",
      "notImportable": "Reference only — see the project page",
      "downloadFailed": "Download failed: {error}"
```

In `zh-TW.json`:

```json
      "download": "下載",
      "downloading": "下載中… {percent}%",
      "installed": "已安裝",
      "entries": "{count} 筆",
      "licence": "授權",
      "viewSource": "前往來源",
      "notImportable": "僅供參考，請至專案頁面取得",
      "downloadFailed": "下載失敗：{error}"
```

In `zh-CN.json`:

```json
      "download": "下载",
      "downloading": "下载中… {percent}%",
      "installed": "已安装",
      "entries": "{count} 条",
      "licence": "许可",
      "viewSource": "前往来源",
      "notImportable": "仅供参考，请至项目页面获取",
      "downloadFailed": "下载失败：{error}"
```

- [ ] **Step 2: Load the catalogue when the dialog opens**

In `DictionaryView.vue`'s `<script setup>`, add:

```typescript
watch(
  () => dictionary.importOpen,
  (open) => {
    if (open && !dictionary.sourcesLoaded) void dictionary.loadSources()
  },
)
```

Ensure `watch` is in the `vue` import.

- [ ] **Step 3: Render licence, link and action per source**

Replace the four hard-coded source cards with a loop over `dictionary.sources`. Each card shows the name, the localised description, and a footer:

```vue
<div class="src-foot">
  <span class="src-licence">{{ t('dictionary.import.licence') }}: {{ s.licence }}</span>
  <a class="src-link" :href="s.homepageUrl" target="_blank" rel="noopener noreferrer">
    {{ t('dictionary.import.viewSource') }}
  </a>
</div>

<button
  v-if="s.supportsImport"
  class="src-action"
  :disabled="dictionary.downloadingCode === s.code"
  @click.stop="s.installed ? dictionary.remove(s.code) : dictionary.download(s.code)"
>
  {{
    dictionary.downloadingCode === s.code
      ? t('dictionary.import.downloading', { percent: dictionary.downloadPercent })
      : s.installed
        ? t('dictionary.import.installed')
        : t('dictionary.import.download')
  }}
</button>
<span v-else class="src-note">{{ t('dictionary.import.notImportable') }}</span>
```

Keep the existing custom-file drop zone below, unchanged — it remains the path for a user's own word list.

Show the error when present:

```vue
<div v-if="dictionary.downloadError" class="src-error">
  {{ t('dictionary.import.downloadFailed', { error: dictionary.downloadError }) }}
</div>
```

- [ ] **Step 4: Verify in a browser**

Run `npm run dev`, open the Dictionary page, click Import. Confirm: three sources listed with licences and working links; WordNet shows the reference-only note instead of a button; clicking Download on ECDICT under mock mode flips it to Installed.

- [ ] **Step 5: Update the API contract**

In `docs/api-contract.md`, add to the endpoint table:

```
| GET           | `/dictionaries?locale=`        | downloadable dictionary catalogue + install directory |
| POST          | `/dictionaries/{code}/download`| start a background fetch and import                   |
| GET           | `/dictionaries/{code}/status`  | download/import progress                              |
| DELETE        | `/dictionaries/{code}`         | remove the files and the imported rows                |
```

Add to the table list:

```
| `DictionarySources`                 | Id, Code, Name, Description, SourceUrl, HomepageUrl, Licence, Format, Compression, ApproxEntries, SupportsImport, SortOrder, Installed, InstalledAt, EntryCount |
```

Add a section after "Localised names":

```markdown
### Dictionary downloads

The app fetches dictionaries from each project's own origin and never hosts or
redistributes the data — which keeps CC-CEDICT's share-alike terms off this
repository while still giving the user a one-button install. Licence and
attribution are shown before installing.

Downloads run in the background behind `/status` polling: holding a request
open for tens of megabytes serves nobody, and a once-per-install progress bar
does not justify a streaming transport.

WordNet is listed for reference but not importable — its format is a set of
database files unlike the other two, and it carries no Chinese glosses.
```

- [ ] **Step 6: Regenerate the schema**

```bash
dotnet run --project server/TypeLab.Api --launch-profile http
```

Stop it once it has started, then:

```bash
npm run db:schema
```

- [ ] **Step 7: Full verification**

```bash
npm run verify
dotnet test server/TypeLab.slnx
```

Expected: both green.

- [ ] **Step 8: Commit**

```bash
npm run format
git add apps/src/views/DictionaryView.vue apps/src/i18n/locales docs/api-contract.md server/db/schema.sql
git commit -m "Offer dictionary downloads from the import dialog"
```

---

## Self-Review

**Spec coverage:**

| Spec section                            | Task |
| --------------------------------------- | ---- |
| Catalogue table + seeded rows           | 1    |
| Storage beside models                   | 2    |
| ECDICT parsing                          | 3    |
| CC-CEDICT parsing                       | 4    |
| Dedupe / mastery preservation           | 5    |
| Download, progress, failure behaviour   | 6    |
| Four endpoints + catalogue translations | 7    |
| Front-end API, fixtures, store          | 8    |
| Dialog, licence display, docs           | 9    |

Out-of-scope items (WordNet import, custom-file path, desktop-side download) are
deliberately absent and recorded as such in the spec.

**Type consistency:** `ParsedWord` is defined in Task 3 and consumed unchanged in
Tasks 4–6. `DownloadStatus` (server) and `DownloadStatusDto` (client) carry the
same five fields. `DictionarySourceDto` matches between Task 7 and Task 8.
`CatalogueLocalizer.Pick(map, id, field, fallback)` matches the existing
signature.

**Known risk not covered by tests:** the seeded URLs are verified by hand at
implementation time and can rot afterwards. A test that fetched them would be
flaky and would fail for reasons unrelated to any change under test; instead the
downloader names the URL in its failure message so a dead link is diagnosable
from the error alone.
