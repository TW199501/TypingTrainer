using System.Globalization;
using SqlSugar;
using TypeLab.Api.Models;

namespace TypeLab.Api.Data;

/// <summary>
/// Resolves a UI locale and looks up catalogue copy in <see cref="Translation"/>.
/// Order is: requested locale → English row → the entity's base column.
/// </summary>
public static class CatalogueLocalizer
{
    public static string ResolveLocale(string? query, string? acceptLanguage)
    {
        if (Canonical(FirstTag(query)) is { } fromQuery) return fromQuery;

        if (!string.IsNullOrWhiteSpace(acceptLanguage))
        {
            // Ordered by the q parameter, not by position: RFC 9110 ranks by
            // quality, and a client that lists its preferred language second
            // would otherwise be handed the wrong one. OrderByDescending is
            // stable, so equal qualities keep the order they were sent in —
            // which is what the spec falls back to.
            var ranked = acceptLanguage
                .Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(ParseEntry)
                // q=0 means "not acceptable" and must never be selected.
                .Where(entry => entry.Quality > 0)
                .OrderByDescending(entry => entry.Quality);

            foreach (var entry in ranked)
            {
                if (Canonical(entry.Tag) is { } fromHeader) return fromHeader;
            }
        }

        return "en";
    }

    /// <summary>
    /// Splits one Accept-Language entry into its tag and quality. A missing or
    /// unparseable q defaults to 1.0, as the spec requires.
    /// </summary>
    private static (string Tag, double Quality) ParseEntry(string raw)
    {
        var parts = raw.Split(';');
        var quality = 1.0;

        foreach (var parameter in parts.Skip(1))
        {
            var pair = parameter.Split('=', 2);
            if (pair.Length == 2
                && pair[0].Trim().Equals("q", StringComparison.OrdinalIgnoreCase)
                && double.TryParse(pair[1].Trim(), NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed))
            {
                quality = parsed;
            }
        }

        return (parts[0].Trim(), quality);
    }

    public static IReadOnlyDictionary<(int Id, string Field), string> Load(
        ISqlSugarClient db,
        string entityType,
        IReadOnlyCollection<int> ids,
        string locale)
    {
        var map = new Dictionary<(int, string), string>();
        if (ids.Count == 0) return map;

        var rows = db.Queryable<Translation>()
            .Where(t => t.EntityType == entityType && ids.Contains(t.EntityId)
                && (t.Locale == locale || t.Locale == "en"))
            .ToList();

        foreach (var row in rows.Where(r => r.Locale == "en"))
            map[(row.EntityId, row.Field)] = row.Value;

        if (!string.Equals(locale, "en", StringComparison.OrdinalIgnoreCase))
        {
            foreach (var row in rows.Where(r => r.Locale == locale))
                map[(row.EntityId, row.Field)] = row.Value;
        }

        return map;
    }

    public static string Pick(
        IReadOnlyDictionary<(int Id, string Field), string> map,
        int id,
        string field,
        string fallback)
    {
        return map.TryGetValue((id, field), out var value) && value.Length > 0 ? value : fallback;
    }

    private static string? FirstTag(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return null;
        return raw.Split(',')[0].Split(';')[0].Trim();
    }

    private static string? Canonical(string? tag)
    {
        if (string.IsNullOrWhiteSpace(tag)) return null;
        if (tag.Equals("zh-TW", StringComparison.OrdinalIgnoreCase)
            || tag.StartsWith("zh-Hant", StringComparison.OrdinalIgnoreCase))
            return "zh-TW";
        if (tag.Equals("zh-CN", StringComparison.OrdinalIgnoreCase)
            || tag.StartsWith("zh-Hans", StringComparison.OrdinalIgnoreCase))
            return "zh-CN";
        if (tag.Equals("en", StringComparison.OrdinalIgnoreCase)
            || tag.StartsWith("en-", StringComparison.OrdinalIgnoreCase))
            return "en";
        return null;
    }
}
