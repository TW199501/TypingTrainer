using TypeLab.Api.Data;

namespace TypeLab.Api.Api;

/// <summary>The dictionary: a paged read with the local user's mastery, and a batch import.</summary>
public static class WordEndpoints
{
    public static IEndpointRouteBuilder MapWords(this IEndpointRouteBuilder app)
    {
        var words = app.MapGroup("/words").WithTags("Dictionary");
        words.MapGet("/", (DictionaryService dict, HttpResponse response, string? topic, string? q,
                int? page, int? size) => LibraryEndpoints.Guard(async () =>
            {
                var (rows, total) = await dict.ListAsync(topic, q, page ?? 1, size ?? 50);
                response.Headers["X-Total-Count"] = total.ToString();
                return Results.Ok(rows);
            }))
            .WithName("GetWords");
        words.MapPost("/import", (DictionaryService dict, ImportWordsRequest body) => LibraryEndpoints.Guard(async () =>
                Results.Ok(await dict.ImportAsync(body))))
            .WithName("ImportWords");

        return app;
    }
}
