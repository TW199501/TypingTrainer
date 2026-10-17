using SqlSugar;
using TypeLab.Api.Api;
using TypeLab.Api.Models;

namespace TypeLab.Api.Data;

/// <summary>Reads and writes the category tree and the practice texts under it.</summary>
public class LibraryService(ISqlSugarClient db)
{
    private const string DefaultColor = "#8b877e";

    // ---- categories ----

    public async Task<List<CategoryDto>> GetCategoriesAsync()
    {
        var all = await db.Queryable<Category>().OrderBy(c => c.SortOrder).OrderBy(c => c.Id).ToListAsync();
        var counts = (await db.Queryable<PracticeText>()
                .GroupBy(t => t.CategoryId)
                .Select(t => new { t.CategoryId, Count = SqlFunc.AggregateCount(t.Id) })
                .ToListAsync())
            .ToDictionary(x => x.CategoryId, x => x.Count);

        return all.Where(c => c.ParentId is null)
            .Select(top => new CategoryDto(
                IdOf(top), top.Name, top.Color ?? DefaultColor, top.Layout ?? "en", top.Kind, top.Code is not null,
                all.Where(s => s.ParentId == top.Id)
                    .Select(s => new SubCategoryDto(
                        s.Id.ToString(), s.Name, counts.GetValueOrDefault(s.Id), s.Code is not null))
                    .ToList()))
            .ToList();
    }

    public async Task<string> CreateCategoryAsync(CreateCategoryRequest request)
    {
        var name = request.Name?.Trim() ?? "";
        if (name.Length == 0)
        {
            throw new LibraryException(400, "Name is required.");
        }

        if (string.Equals(request.Level, "top", StringComparison.OrdinalIgnoreCase))
        {
            var row = new Category
            {
                Name = name,
                Color = string.IsNullOrWhiteSpace(request.Color) ? DefaultColor : request.Color.Trim(),
                Layout = "en",
                Kind = "custom",
                SortOrder = await NextSortOrderAsync(null),
            };
            row.Id = await db.Insertable(row).ExecuteReturnIdentityAsync();
            return row.Id.ToString();
        }

        if (!string.Equals(request.Level, "sub", StringComparison.OrdinalIgnoreCase))
        {
            throw new LibraryException(400, "Level must be 'top' or 'sub'.");
        }

        var parent = await FindCategoryAsync(request.ParentId);
        if (parent is null || parent.ParentId is not null)
        {
            throw new LibraryException(404, "Parent category not found.");
        }

        var sub = NewSub(parent, name, await NextSortOrderAsync(parent.Id));
        sub.Id = await db.Insertable(sub).ExecuteReturnIdentityAsync();
        return sub.Id.ToString();
    }

    public async Task RenameCategoryAsync(string id, string name)
    {
        var trimmed = name?.Trim() ?? "";
        if (trimmed.Length == 0)
        {
            throw new LibraryException(400, "Name is required.");
        }

        var row = await RequireUserCategoryAsync(id);
        row.Name = trimmed;
        await db.Updateable(row).UpdateColumns(c => c.Name).ExecuteCommandAsync();
    }

    public async Task DeleteCategoryAsync(string id)
    {
        var row = await RequireUserCategoryAsync(id);
        var uncategorised = await db.Queryable<Category>()
            .FirstAsync(c => c.Code == CategorySeeds.UncategorisedSubCode)
            ?? throw new LibraryException(500, "The Uncategorised sub-category is missing.");

        var ids = new List<int> { row.Id };
        if (row.ParentId is null)
        {
            ids.AddRange((await db.Queryable<Category>().Where(c => c.ParentId == row.Id).ToListAsync())
                .Select(c => c.Id));
        }

        var target = uncategorised.Id;
        await InTransactionAsync(async () =>
        {
            await db.Updateable<PracticeText>()
                .SetColumns(t => t.CategoryId == target)
                .Where(t => ids.Contains(t.CategoryId))
                .ExecuteCommandAsync();
            await db.Deleteable<Category>().Where(c => ids.Contains(c.Id)).ExecuteCommandAsync();
        });
    }

    // ---- texts ----

    public async Task<TextPage> ListTextsAsync(
        string? category, string? sub, string? level, bool? builtIn, int page, int size)
    {
        size = Math.Clamp(size, 1, 500);
        page = Math.Max(page, 1);

        var query = db.Queryable<PracticeText>();
        if (!string.IsNullOrWhiteSpace(sub))
        {
            var subId = (await FindCategoryAsync(sub))?.Id ?? -1;
            query = query.Where(t => t.CategoryId == subId);
        }
        else if (!string.IsNullOrWhiteSpace(category))
        {
            var top = await FindCategoryAsync(category);
            var ids = top is null
                ? [-1]
                : (await db.Queryable<Category>().Where(c => c.ParentId == top.Id).ToListAsync())
                    .Select(c => c.Id).Append(top.Id).ToList();
            query = query.Where(t => ids.Contains(t.CategoryId));
        }

        if (!string.IsNullOrWhiteSpace(level))
        {
            var value = ParseLevel(level, 0);
            query = query.Where(t => t.Level == value);
        }

        if (builtIn is true)
        {
            query = query.Where(t => t.Code != null);
        }
        else if (builtIn is false)
        {
            query = query.Where(t => t.Code == null);
        }

        RefAsync<int> total = 0;
        var rows = await query
            .OrderBy(t => SqlFunc.IIF(t.Code == null, 0, 1))
            .OrderBy(t => SqlFunc.IIF(t.Code == null, 0, t.SortOrder))
            .OrderBy(t => t.CreatedAt, OrderByType.Desc)
            .ToPageListAsync(page, size, total);

        return new TextPage(await ToDtosAsync(rows, withContent: false), total.Value);
    }

    public async Task<TextDto?> GetTextAsync(int id)
    {
        var row = await db.Queryable<PracticeText>().FirstAsync(t => t.Id == id);
        return row is null ? null : (await ToDtosAsync([row], withContent: true))[0];
    }

    public async Task<TextDto> CreateTextAsync(CreateTextRequest request)
    {
        Validate([request]);
        var userId = LocalUserSeeds.Seed(db);
        var id = 0;
        await InTransactionAsync(async () => id = await InsertTextAsync(request, userId));
        return (await GetTextAsync(id))!;
    }

    public async Task<List<TextDto>> ImportTextsAsync(ImportTextsRequest request)
    {
        var texts = request.Texts ?? [];
        Validate(texts);
        var userId = LocalUserSeeds.Seed(db);
        var ids = new List<int>();
        await InTransactionAsync(async () =>
        {
            foreach (var text in texts)
            {
                ids.Add(await InsertTextAsync(text, userId));
            }
        });

        var saved = await db.Queryable<PracticeText>().Where(t => ids.Contains(t.Id)).ToListAsync();
        return await ToDtosAsync(ids.Select(i => saved.First(t => t.Id == i)).ToList(), withContent: false);
    }

    public async Task DeleteTextAsync(int id)
    {
        var row = await db.Queryable<PracticeText>().FirstAsync(t => t.Id == id)
            ?? throw new LibraryException(404, "Text not found.");
        if (row.Code is not null)
        {
            throw new LibraryException(409, "Built-in texts cannot be deleted.");
        }

        await InTransactionAsync(async () =>
        {
            var passes = (await db.Queryable<TextSegmentation>().Where(s => s.TextId == id).ToListAsync())
                .Select(s => s.Id).ToList();
            await db.Deleteable<TextSegment>().Where(s => passes.Contains(s.SegmentationId)).ExecuteCommandAsync();
            await db.Deleteable<TextSegmentation>().Where(s => s.TextId == id).ExecuteCommandAsync();
            await db.Deleteable<PracticeText>().Where(t => t.Id == id).ExecuteCommandAsync();
        });
    }

    // ---- helpers ----

    /// <summary>The id the API exposes: a built-in top-level category is addressed by its Code, everything else by Id.</summary>
    private static string IdOf(Category c) => c.ParentId is null && c.Code is not null ? c.Code : c.Id.ToString();

    private static Category NewSub(Category parent, string name, int sortOrder) => new()
    {
        ParentId = parent.Id,
        Name = name,
        Color = parent.Color,
        Layout = parent.Layout,
        Kind = parent.Kind,
        SortOrder = sortOrder,
    };

    private static int ParseLevel(string? level, int fallback)
    {
        var digits = level?.Trim().TrimStart('L', 'l');
        return int.TryParse(digits, out var n) ? n : fallback;
    }

    /// <summary>Resolves an id from the API: an integer row Id first, otherwise a built-in top-level Code.</summary>
    private async Task<Category?> FindCategoryAsync(string? id)
    {
        if (string.IsNullOrWhiteSpace(id))
        {
            return null;
        }

        if (int.TryParse(id, out var n))
        {
            return await db.Queryable<Category>().FirstAsync(c => c.Id == n);
        }

        return await db.Queryable<Category>().FirstAsync(c => c.ParentId == null && c.Code == id);
    }

    private async Task<Category> RequireUserCategoryAsync(string id)
    {
        var row = await FindCategoryAsync(id) ?? throw new LibraryException(404, "Category not found.");
        if (row.Code is not null)
        {
            throw new LibraryException(409, "Built-in categories cannot be changed.");
        }

        return row;
    }

    private async Task<int> NextSortOrderAsync(int? parentId)
    {
        var siblings = await db.Queryable<Category>().Where(c => c.ParentId == parentId).ToListAsync();
        return siblings.Count == 0 ? 0 : siblings.Max(c => c.SortOrder) + 1;
    }

    private static void Validate(IReadOnlyList<CreateTextRequest> texts)
    {
        var failed = new List<string>();
        for (var i = 0; i < texts.Count; i++)
        {
            var t = texts[i];
            if (string.IsNullOrWhiteSpace(t.Title) || string.IsNullOrWhiteSpace(t.Content))
            {
                failed.Add(string.IsNullOrWhiteSpace(t.FileName) ? (i + 1).ToString() : t.FileName);
            }
        }

        if (failed.Count > 0)
        {
            throw new LibraryException(400, "Some texts have no title or content.", failed);
        }
    }

    /// <summary>Finds or creates the sub-category a new text goes under, and returns it with its top-level parent.</summary>
    private async Task<(Category Sub, Category Top)> ResolveTargetAsync(CreateTextRequest request)
    {
        var picked = await FindCategoryAsync(request.CategoryId);
        if (picked is not null && picked.ParentId is not null)
        {
            var parent = await db.Queryable<Category>().FirstAsync(c => c.Id == picked.ParentId);
            return (picked, parent);
        }

        if (picked is null)
        {
            var uncategorised = await db.Queryable<Category>()
                .FirstAsync(c => c.Code == CategorySeeds.UncategorisedSubCode)
                ?? throw new LibraryException(500, "The Uncategorised sub-category is missing.");
            var top = await db.Queryable<Category>().FirstAsync(c => c.Id == uncategorised.ParentId);
            return (uncategorised, top);
        }

        var subs = await db.Queryable<Category>()
            .Where(c => c.ParentId == picked.Id)
            .OrderBy(c => c.SortOrder)
            .ToListAsync();
        var name = request.Sub?.Trim() ?? "";
        var match = name.Length == 0
            ? subs.FirstOrDefault()
            : subs.FirstOrDefault(s => string.Equals(s.Name, name, StringComparison.OrdinalIgnoreCase));
        if (match is null)
        {
            match = NewSub(picked, name.Length == 0 ? "Uncategorised" : name, await NextSortOrderAsync(picked.Id));
            match.Id = await db.Insertable(match).ExecuteReturnIdentityAsync();
        }

        return (match, picked);
    }

    private async Task<int> InsertTextAsync(CreateTextRequest request, int userId)
    {
        var (sub, top) = await ResolveTargetAsync(request);
        var row = new PracticeText
        {
            CategoryId = sub.Id,
            Title = request.Title.Trim(),
            Content = request.Content,
            Level = ParseLevel(request.Level, 3),
            Chars = request.Content.Length,
            Language = top.Layout is "zh" or "zhuyin" ? "zh" : "en",
            CreatedBy = userId,
            CreatedAt = DateTime.UtcNow,
        };
        return await db.Insertable(row).ExecuteReturnIdentityAsync();
    }

    private async Task InTransactionAsync(Func<Task> work)
    {
        var result = await db.Ado.UseTranAsync(work);
        if (!result.IsSuccess)
        {
            throw result.ErrorException ?? new InvalidOperationException(result.ErrorMessage);
        }
    }

    private async Task<List<TextDto>> ToDtosAsync(List<PracticeText> rows, bool withContent)
    {
        var cats = (await db.Queryable<Category>().ToListAsync()).ToDictionary(c => c.Id);
        return rows.Select(t =>
        {
            var sub = cats[t.CategoryId];
            var top = sub.ParentId is int p ? cats[p] : sub;
            return new TextDto(
                t.Id, t.Title, top.Name, sub.Name, IdOf(top), sub.Id.ToString(), "L" + t.Level, t.Chars,
                null, null, t.Code is not null, withContent ? t.Content : null);
        }).ToList();
    }
}
