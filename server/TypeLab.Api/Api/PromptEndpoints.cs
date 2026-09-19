using SqlSugar;
using TypeLab.Api.Data;
using TypeLab.Api.Models;

namespace TypeLab.Api.Api;

/// <summary>
/// Built-in prompt catalogue. Content stays in the language it was authored
/// in (English, for the LLM); Name and Description follow the UI locale.
/// User copies of a Code are a separate row and are not returned here.
/// </summary>
public static class PromptEndpoints
{
    public record PromptDto(
        string Code,
        string Name,
        string? Description,
        string Content,
        bool IsBuiltIn);

    public static RouteGroupBuilder MapPrompts(this IEndpointRouteBuilder app, string prefix = "/prompts")
    {
        var group = app.MapGroup(prefix).WithTags("Prompts");

        group.MapGet("/", async (ISqlSugarClient db, HttpRequest request, string? locale) =>
        {
            var tag = CatalogueLocalizer.ResolveLocale(locale, request.Headers.AcceptLanguage);
            var rows = await db.Queryable<PromptTemplate>()
                .Where(p => p.IsBuiltIn)
                .OrderBy(p => p.Id)
                .ToListAsync();
            var copy = CatalogueLocalizer.Load(db, CatalogueTranslationSeeds.PromptEntity,
                rows.Select(r => r.Id).ToList(), tag);

            return Results.Ok(rows.Select(p => new PromptDto(
                p.Code,
                CatalogueLocalizer.Pick(copy, p.Id, "Name", p.Name),
                NullIfEmpty(CatalogueLocalizer.Pick(copy, p.Id, "Description", p.Description ?? "")),
                p.Content,
                p.IsBuiltIn)).ToList());
        })
        .WithName("GetPrompts");

        return group;
    }

    private static string? NullIfEmpty(string value) => value.Length == 0 ? null : value;
}
