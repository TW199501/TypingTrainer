using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using TypeLab.Api.Data;

namespace TypeLab.Api.Api;

/// <summary>The dictionary: a paged read with the local user's mastery, and the import of a word file.</summary>
public static class WordEndpoints
{
    private static readonly JsonSerializerOptions MapJson = new(JsonSerializerDefaults.Web);

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

        words.MapPost("/import/preview", (DictionaryService dict, HttpRequest request, CancellationToken ct) =>
                LibraryEndpoints.Guard(async () =>
                {
                    var form = await ReadFormAsync(request, ct);
                    var file = FileOf(form);
                    await using var stream = file.OpenReadStream();
                    return Results.Ok(await dict.PreviewAsync(stream, file.FileName, ct));
                }))
            .WithName("PreviewWordImport")
            .AllowLargeUpload();

        words.MapPost("/import/file", (DictionaryService dict, HttpRequest request, CancellationToken ct) =>
                LibraryEndpoints.Guard(async () =>
                {
                    var form = await ReadFormAsync(request, ct);
                    var file = FileOf(form);
                    var map = MapOf(form["map"]);
                    var skipDuplicates = BoolOf(form["skipDuplicates"]);
                    await using var stream = file.OpenReadStream();
                    return Results.Ok(await dict.ImportFileAsync(stream, file.FileName, map, skipDuplicates, ct));
                }))
            .WithName("ImportWordFile")
            .AllowLargeUpload();

        return app;
    }

    /// <summary>
    /// Raises the request body and multipart limits of an upload endpoint to the importer's own
    /// file limit; every other endpoint keeps the server defaults.
    /// </summary>
    private static RouteHandlerBuilder AllowLargeUpload(this RouteHandlerBuilder builder) => builder
        .WithMetadata(new RequestSizeLimitAttribute(WordFile.MaxBytes))
        .WithFormOptions(multipartBodyLengthLimit: WordFile.MaxBytes)
        .Accepts<IFormFile>("multipart/form-data");

    private static async Task<IFormCollection> ReadFormAsync(HttpRequest request, CancellationToken ct)
    {
        if (!request.HasFormContentType)
        {
            throw new LibraryException(400, "Send the file as multipart/form-data.");
        }

        try
        {
            return await request.ReadFormAsync(ct);
        }
        catch (Exception ex) when (ex is InvalidDataException
                                       or BadHttpRequestException { StatusCode: StatusCodes.Status413PayloadTooLarge })
        {
            throw new LibraryException(StatusCodes.Status413PayloadTooLarge, "The file is larger than 256 MiB.");
        }
    }

    private static IFormFile FileOf(IFormCollection form) =>
        form.Files.GetFile("file") ?? throw new LibraryException(400, "No file was sent.");

    private static WordImportMap MapOf(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            throw new LibraryException(400, "The column map is missing.");
        }

        try
        {
            return JsonSerializer.Deserialize<WordImportMap>(json, MapJson)
                   ?? throw new LibraryException(400, "The column map is missing.");
        }
        catch (JsonException)
        {
            throw new LibraryException(400, "The column map is not valid JSON.");
        }
    }

    private static bool BoolOf(string? value) =>
        !string.IsNullOrWhiteSpace(value) && (bool.TryParse(value, out var b)
            ? b
            : throw new LibraryException(400, "skipDuplicates must be true or false."));
}
