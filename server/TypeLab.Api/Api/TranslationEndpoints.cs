using XiHan.Framework.Translation.Abstractions;
using XiHan.Framework.Translation.Abstractions.Languages;

namespace TypeLab.Api.Api;

/// <summary>
/// Fills in the UI locales a user did not type.
///
/// Category and topic names created at runtime cannot live in the front-end
/// i18n files — those are bundled at build time — so they are translated here
/// and stored in the Translations table. The user types in whichever of the
/// three locales they prefer and the other two are derived.
/// </summary>
public static class TranslationEndpoints
{
    /// <summary>The locales the interface ships in; `en` is the i18n source of truth.</summary>
    public static readonly string[] UiLocales = ["en", "zh-TW", "zh-CN"];

    public record TranslateLocalesRequest(string Text, string SourceLocale, string? Context);

    public record TranslateLocalesResponse(
        string SourceLocale,
        IReadOnlyDictionary<string, string> Values,
        IReadOnlyList<string> Failed);

    public static RouteGroupBuilder MapTranslation(this IEndpointRouteBuilder app, string prefix = "/translate")
    {
        var group = app.MapGroup(prefix).WithTags("Translation");

        group.MapGet("/providers", (IEnumerable<ITranslator> translators) =>
            Results.Ok(translators.Select(t => new
            {
                t.Name,
                t.IsBuiltIn,
                t.IsConfigured,
            })))
            .WithName("GetTranslationProviders");

        // One call per saved name: type it once, get every UI locale back.
        group.MapPost("/locales", async (
            ITranslationService translation,
            TranslateLocalesRequest body,
            CancellationToken cancellationToken) =>
        {
            if (string.IsNullOrWhiteSpace(body.Text))
            {
                return Results.BadRequest(new { message = "Text is required." });
            }

            var source = TranslationLanguageExtensions.FromBcp47(body.SourceLocale);
            if (source == TranslationLanguage.Auto)
            {
                return Results.BadRequest(new { message = $"Unsupported locale: {body.SourceLocale}." });
            }

            var targets = UiLocales
                .Select(TranslationLanguageExtensions.FromBcp47)
                .Where(l => l != TranslationLanguage.Auto && l != source)
                .ToList();

            var results = await translation.TranslateManyAsync(
                body.Text, source, targets, body.Context, cancellationToken);

            // The locale the user typed is authoritative and is echoed back, so
            // the caller can store every locale from one response.
            var values = new Dictionary<string, string> { [source.ToBcp47()] = body.Text };
            var failed = new List<string>();

            foreach (var (language, result) in results)
            {
                var tag = language.ToBcp47();
                // A failed result still carries the source text when
                // FallbackToSourceText is on: keep it so the row is complete,
                // but report the locale so it can be retried later.
                values[tag] = string.IsNullOrEmpty(result.Text) ? body.Text : result.Text;
                if (!result.IsSuccess) failed.Add(tag);
            }

            return Results.Ok(new TranslateLocalesResponse(source.ToBcp47(), values, failed));
        })
        .WithName("TranslateLocales");

        return group;
    }
}
