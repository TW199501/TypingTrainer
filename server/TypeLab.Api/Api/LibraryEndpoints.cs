using TypeLab.Api.Data;

namespace TypeLab.Api.Api;

/// <summary>Category tree and practice texts: reads, user-created rows, and the guards on built-in ones.</summary>
public static class LibraryEndpoints
{
    public static IEndpointRouteBuilder MapLibrary(this IEndpointRouteBuilder app)
    {
        var categories = app.MapGroup("/categories").WithTags("Library");
        categories.MapGet("/", async (LibraryService lib) => Results.Ok(await lib.GetCategoriesAsync()))
            .WithName("GetCategories");
        categories.MapPost("/", (LibraryService lib, CreateCategoryRequest body) => Guard(async () =>
            {
                var id = await lib.CreateCategoryAsync(body);
                return Results.Created($"/api/categories/{id}", new { id });
            }))
            .WithName("CreateCategory");
        categories.MapPut("/{id}", (LibraryService lib, string id, RenameCategoryRequest body) => Guard(async () =>
            {
                await lib.RenameCategoryAsync(id, body.Name);
                return Results.NoContent();
            }))
            .WithName("RenameCategory");
        categories.MapDelete("/{id}", (LibraryService lib, string id) => Guard(async () =>
            {
                await lib.DeleteCategoryAsync(id);
                return Results.NoContent();
            }))
            .WithName("DeleteCategory");

        var texts = app.MapGroup("/texts").WithTags("Library");
        texts.MapGet("/", (LibraryService lib, HttpResponse response, string? category, string? sub, string? level,
                bool? builtIn, int? page, int? size) => Guard(async () =>
            {
                var result = await lib.ListTextsAsync(category, sub, level, builtIn, page ?? 1, size ?? 50);
                response.Headers["X-Total-Count"] = result.Total.ToString();
                return Results.Ok(result.Rows);
            }))
            .WithName("GetTexts");
        texts.MapGet("/{id:int}", (LibraryService lib, int id) => Guard(async () =>
                await lib.GetTextAsync(id) is { } text ? Results.Ok(text) : Results.NotFound()))
            .WithName("GetText");
        texts.MapPost("/", (LibraryService lib, CreateTextRequest body) => Guard(async () =>
            {
                var text = await lib.CreateTextAsync(body);
                return Results.Created($"/api/texts/{text.Id}", text);
            }))
            .WithName("CreateText");
        texts.MapPost("/import", (LibraryService lib, ImportTextsRequest body) => Guard(async () =>
                Results.Ok(await lib.ImportTextsAsync(body))))
            .WithName("ImportTexts");
        texts.MapDelete("/{id:int}", (LibraryService lib, int id) => Guard(async () =>
            {
                await lib.DeleteTextAsync(id);
                return Results.NoContent();
            }))
            .WithName("DeleteText");

        return app;
    }

    /// <summary>Runs <paramref name="action"/>, turning a <see cref="LibraryException"/> into a ProblemDetails response.</summary>
    internal static async Task<IResult> Guard(Func<Task<IResult>> action)
    {
        try
        {
            return await action();
        }
        catch (LibraryException ex)
        {
            var extensions = ex.Failed is null
                ? null
                : new Dictionary<string, object?> { ["failed"] = ex.Failed };
            return Results.Problem(statusCode: ex.Status, title: ex.Message, extensions: extensions);
        }
    }
}
