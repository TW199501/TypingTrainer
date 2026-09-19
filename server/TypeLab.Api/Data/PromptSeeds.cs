using SqlSugar;
using TypeLab.Api.Models;

namespace TypeLab.Api.Data;

/// <summary>
/// The prompts the app ships with. Edit them here — never in the database —
/// and bump <see cref="PromptTemplate.Revision"/>; the change reaches every
/// deployment on the next start. User-authored rows for the same Code are left
/// untouched.
///
/// The first four are carried over verbatim from the presets the front end used
/// to hard-code in <c>apps/src/stores/ai.ts</c>, so behaviour is unchanged by
/// the move to the server. <c>segment.zh</c> is new — Chinese segmentation has
/// no front-end counterpart.
/// </summary>
public static class PromptSeeds
{
    public static readonly PromptTemplate[] All =
    [
        new()
        {
            Code = "categorise",
            Name = "Categorise",
            Description = "Files a pasted or imported text into group, topic and level.",
            Revision = 1,
            Content =
                "Detect the language and topic, then return a title (max 18 chars), "
                + "group, topic and an L1–L6 level with a one-line rationale.",
        },
        new()
        {
            Code = "examples",
            Name = "Examples",
            Description = "Generates an example sentence for a dictionary term.",
            Revision = 1,
            Content =
                "Write one practical 12–18 word sentence for the given term in a "
                + "workplace context, with a Traditional Chinese translation.",
        },
        new()
        {
            Code = "rewrite",
            Name = "Rewrite",
            Description = "Rewrites a text to drill the keys the learner misses most.",
            Revision = 1,
            Content =
                "Weave the user’s most-missed keys naturally into the text, keeping it "
                + "readable and about the same length.",
        },
        new()
        {
            Code = "level",
            Name = "Level",
            Description = "Scores typing difficulty.",
            Revision = 1,
            Content =
                "Score L1–L6 from sentence length, symbol density and rare-word ratio, "
                + "with a one-line reason.",
        },
        new()
        {
            Code = "segment.zh",
            Name = "Chinese segmentation",
            Description =
                "Splits a Chinese practice text into the units a learner types as one "
                + "chunk, with part of speech and bopomofo.",
            Revision = 1,
            Content = """
                You segment Chinese text for a typing trainer. The learner types the
                text character by character; your job is to mark the word boundaries
                that per-word accuracy and the bopomofo prompt are measured against.

                Return JSON and nothing else:
                {"tokens":[{"t":"詞","pos":"n","r":"ㄘˊ"}]}

                Rules:
                - `t` is the surface form, verbatim and in input order. Concatenating
                  every `t` must reproduce the input exactly — same characters, same
                  punctuation, same whitespace. This is the one hard constraint; if a
                  segmentation choice would break it, choose differently.
                - Keep as one token what a learner types as one unit: 成語, proper
                  nouns, numbers with their measure word, and verb-complement pairs.
                  Split particles (的, 了, 嗎, 呢) and conjunctions into their own
                  tokens.
                - `pos` is one of: n v adj adv num pron prep conj part punct other.
                - `r` is bopomofo with tone marks, for Han characters only. Omit it
                  for punctuation, latin runs and digits.
                - Never translate, correct, reorder, or comment on the input. Text
                  containing errors is segmented as written — the errors are the
                  point of the drill.
                """,
        },
    ];

    /// <summary>
    /// Upserts the built-in rows. Matching is on (Code, CreatedBy = null), so a
    /// user's own row under the same Code is never touched.
    /// </summary>
    public static void Seed(ISqlSugarClient db)
    {
        var existing = db.Queryable<PromptTemplate>()
            .Where(p => p.IsBuiltIn)
            .ToList()
            .ToDictionary(p => p.Code, p => p);

        foreach (var seed in All)
        {
            if (!existing.TryGetValue(seed.Code, out var row))
            {
                seed.IsBuiltIn = true;
                seed.CreatedBy = null;
                seed.UpdatedAt = DateTime.UtcNow;
                db.Insertable(seed).ExecuteCommand();
                continue;
            }

            // Only rewrite when the shipped copy actually moved on.
            if (row.Revision == seed.Revision && row.Content == seed.Content) continue;

            row.Name = seed.Name;
            row.Description = seed.Description;
            row.Content = seed.Content;
            row.ModelHint = seed.ModelHint;
            row.Revision = seed.Revision;
            row.UpdatedAt = DateTime.UtcNow;
            db.Updateable(row).ExecuteCommand();
        }
    }
}
