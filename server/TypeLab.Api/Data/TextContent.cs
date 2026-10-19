using SqlSugar;
using TypeLab.Api.Models;

namespace TypeLab.Api.Data;

/// <summary>Cleans practice text so every character left in it can be typed.</summary>
public static class TextContent
{
    /// <summary>
    /// CRLF and lone CR become LF, a tab becomes one space, whitespace at the end of
    /// each line is dropped, and blank lines at the start and the end are removed.
    /// Running it on its own output changes nothing.
    /// </summary>
    public static string Normalise(string? content)
    {
        var lines = (content ?? "")
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Replace('\t', ' ')
            .Split('\n')
            .Select(line => line.TrimEnd())
            .ToList();

        var start = 0;
        while (start < lines.Count && lines[start].Length == 0)
        {
            start++;
        }

        var end = lines.Count;
        while (end > start && lines[end - 1].Length == 0)
        {
            end--;
        }

        return string.Join('\n', lines.Skip(start).Take(end - start));
    }

    /// <summary>
    /// Normalises the user texts (<see cref="PracticeText.Code"/> null) already stored and
    /// returns how many rows changed. Clean rows are left alone, so a second run is a no-op;
    /// a row that would end up empty is kept as it is.
    /// </summary>
    public static int NormaliseStored(ISqlSugarClient db)
    {
        var changed = 0;
        foreach (var row in db.Queryable<PracticeText>().Where(t => t.Code == null).ToList())
        {
            var clean = Normalise(row.Content);
            if (clean.Length == 0 || (clean == row.Content && row.Chars == clean.Length))
            {
                continue;
            }

            row.Content = clean;
            row.Chars = clean.Length;
            db.Updateable(row).UpdateColumns(t => new { t.Content, t.Chars }).ExecuteCommand();
            changed++;
        }

        return changed;
    }
}
