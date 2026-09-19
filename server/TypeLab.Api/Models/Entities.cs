using SqlSugar;

namespace TypeLab.Api.Models;

// Mirrors the tables in docs/api-contract.md, annotated for SqlSugar CodeFirst.
//
// Two deliberate choices:
//  - No `required` members. SqlSugar materialises rows through
//    Activator.CreateInstance, which throws on required members, so defaults
//    are used instead.
//  - DateTime (UTC) rather than DateTimeOffset, which SQLite cannot store
//    natively and SqlSugar does not round-trip reliably.

[SugarTable("Users")]
[SugarIndex("ux_users_username", nameof(Username), OrderByType.Asc, true)]
public class User
{
    [SugarColumn(IsPrimaryKey = true, IsIdentity = true)]
    public int Id { get; set; }

    [SugarColumn(Length = 64)]
    public string Username { get; set; } = string.Empty;

    [SugarColumn(Length = 256)]
    public string PasswordHash { get; set; } = string.Empty;

    [SugarColumn(Length = 32)]
    public string KeyboardLayout { get; set; } = "us";

    [SugarColumn(Length = 16)]
    public string UiLanguage { get; set; } = "en";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Navigate(NavigateType.OneToMany, nameof(Session.UserId))]
    public List<Session>? Sessions { get; set; }
}

[SugarTable("Categories")]
public class Category
{
    [SugarColumn(IsPrimaryKey = true, IsIdentity = true)]
    public int Id { get; set; }

    [SugarColumn(IsNullable = true)]
    public int? ParentId { get; set; }

    /// <summary>
    /// The name as stored. For seeded categories this is the English fallback;
    /// for user-created ones it is exactly what the user typed.
    /// </summary>
    [SugarColumn(Length = 128)]
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Set only on the categories that ship with the app, e.g.
    /// <c>category.basics</c>. When present the UI renders the front-end
    /// translation for that key and ignores <see cref="Name"/>.
    ///
    /// This is the line between copy and data: shipped categories are copy, so
    /// their translations live in the i18n JSON and improve with each release
    /// without a database migration. A category the user creates at runtime can
    /// never be in a bundle that was built before it existed — that one is data,
    /// and its translations go in <see cref="Translation"/>.
    /// </summary>
    [SugarColumn(Length = 64, IsNullable = true)]
    public string? I18nKey { get; set; }

    [SugarColumn(Length = 32, IsNullable = true)]
    public string? Color { get; set; }

    [SugarColumn(Length = 32, IsNullable = true)]
    public string? Layout { get; set; }

    /// <summary>basics · english · chinese · bopomofo · vocab · code · timed</summary>
    [SugarColumn(Length = 32)]
    public string Kind { get; set; } = string.Empty;

    public int SortOrder { get; set; }

    [Navigate(NavigateType.OneToMany, nameof(ParentId))]
    public List<Category>? Children { get; set; }
}

[SugarTable("Texts")]
public class PracticeText
{
    [SugarColumn(IsPrimaryKey = true, IsIdentity = true)]
    public int Id { get; set; }

    public int CategoryId { get; set; }

    [SugarColumn(Length = 256)]
    public string Title { get; set; } = string.Empty;

    [SugarColumn(ColumnDataType = "text")]
    public string Content { get; set; } = string.Empty;

    public int Level { get; set; }
    public int Chars { get; set; }

    [SugarColumn(Length = 16)]
    public string Language { get; set; } = "en";

    [SugarColumn(IsNullable = true)]
    public int? CreatedBy { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Navigate(NavigateType.OneToOne, nameof(CategoryId))]
    public Category? Category { get; set; }
}

/// <summary>
/// One segmentation pass over a text. Kept separate from the tokens so a text
/// can hold several passes at once: jieba today, an LLM tomorrow, and a
/// hand-corrected one on top. <see cref="Engine"/> plus <see cref="ModelVersion"/>
/// identify which produced a given token set, so a pass can be recomputed or
/// discarded without touching the others.
/// </summary>
[SugarTable("TextSegmentations")]
[SugarIndex("ix_segmentations_text", nameof(TextId), OrderByType.Asc)]
public class TextSegmentation
{
    [SugarColumn(IsPrimaryKey = true, IsIdentity = true)]
    public int Id { get; set; }

    public int TextId { get; set; }

    /// <summary>jieba · ckip · llm · manual</summary>
    [SugarColumn(Length = 32)]
    public string Engine { get; set; } = string.Empty;

    [SugarColumn(Length = 64, IsNullable = true)]
    public string? ModelVersion { get; set; }

    /// <summary>The active pass the practice screen reads; only one per text.</summary>
    public bool IsPrimary { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Navigate(NavigateType.OneToMany, nameof(TextSegment.SegmentationId))]
    public List<TextSegment>? Segments { get; set; }
}

/// <summary>
/// A single token. CharStart/CharLength index into the parent text so the
/// practice screen can map a keystroke back to the word being typed — that is
/// what lets per-word accuracy and the bopomofo prompt work on Chinese runs.
/// </summary>
[SugarTable("TextSegments")]
[SugarIndex("ux_segments_pass_seq", nameof(SegmentationId), OrderByType.Asc, nameof(Seq), OrderByType.Asc, true)]
[SugarIndex("ix_segments_token", nameof(Token), OrderByType.Asc)]
public class TextSegment
{
    [SugarColumn(IsPrimaryKey = true, IsIdentity = true)]
    public int Id { get; set; }

    public int SegmentationId { get; set; }
    public int Seq { get; set; }

    [SugarColumn(Length = 64)]
    public string Token { get; set; } = string.Empty;

    /// <summary>Part of speech, in the tag set of the engine that produced it.</summary>
    [SugarColumn(Length = 16, IsNullable = true)]
    public string? Pos { get; set; }

    /// <summary>Offset into the parent text, in UTF-16 code units.</summary>
    public int CharStart { get; set; }
    public int CharLength { get; set; }

    /// <summary>Bopomofo or pinyin for the token, when the engine supplies it.</summary>
    [SugarColumn(Length = 64, IsNullable = true)]
    public string? Reading { get; set; }

    /// <summary>Links to the dictionary when the token is a known headword.</summary>
    [SugarColumn(IsNullable = true)]
    public int? WordId { get; set; }
}

[SugarTable("Sessions")]
[SugarIndex("ix_sessions_user_created", nameof(UserId), OrderByType.Asc, nameof(CreatedAt), OrderByType.Desc)]
public class Session
{
    [SugarColumn(IsPrimaryKey = true, IsIdentity = true)]
    public int Id { get; set; }

    public int UserId { get; set; }

    [SugarColumn(IsNullable = true)]
    public int? TextId { get; set; }

    [SugarColumn(Length = 32)]
    public string Mode { get; set; } = string.Empty;

    /// <summary>WPM for latin runs, CPM for Chinese ones — <see cref="Unit"/> says which.</summary>
    public double Speed { get; set; }

    [SugarColumn(Length = 8)]
    public string Unit { get; set; } = "wpm";

    public double Accuracy { get; set; }
    public int DurationSec { get; set; }
    public int ErrorCount { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Navigate(NavigateType.OneToMany, nameof(SessionKeystroke.SessionId))]
    public List<SessionKeystroke>? Keystrokes { get; set; }

    [Navigate(NavigateType.OneToMany, nameof(KeyError.SessionId))]
    public List<KeyError>? KeyErrors { get; set; }
}

/// <summary>Raw keystroke log kept so the server can re-derive the score (anti-cheat).</summary>
[SugarTable("SessionKeystrokes")]
[SugarIndex("ux_keystrokes_session_seq", nameof(SessionId), OrderByType.Asc, nameof(Seq), OrderByType.Asc, true)]
public class SessionKeystroke
{
    [SugarColumn(IsPrimaryKey = true, IsIdentity = true)]
    public int Id { get; set; }

    public int SessionId { get; set; }
    public int Seq { get; set; }

    [SugarColumn(Length = 8)]
    public string KeyChar { get; set; } = string.Empty;

    public int OffsetMs { get; set; }
    public bool IsCorrect { get; set; }
}

[SugarTable("KeyErrors")]
public class KeyError
{
    [SugarColumn(IsPrimaryKey = true, IsIdentity = true)]
    public int Id { get; set; }

    public int SessionId { get; set; }

    [SugarColumn(Length = 8)]
    public string KeyChar { get; set; } = string.Empty;

    public int Count { get; set; }
}

/// <summary>Spaced repetition state; Box walks the 1·2·4·7·15·30 day ladder.</summary>
[SugarTable("ErrorBook")]
[SugarIndex("ux_errorbook_user_key", nameof(UserId), OrderByType.Asc, nameof(KeyChar), OrderByType.Asc, true)]
public class ErrorBookEntry
{
    [SugarColumn(IsPrimaryKey = true, IsIdentity = true)]
    public int Id { get; set; }

    public int UserId { get; set; }

    [SugarColumn(Length = 8)]
    public string KeyChar { get; set; } = string.Empty;

    public int Total { get; set; }
    public int Box { get; set; }
    public DateTime DueAt { get; set; }
}

[SugarTable("Words")]
[SugarIndex("ix_words_text", nameof(Text), OrderByType.Asc)]
public class Word
{
    [SugarColumn(IsPrimaryKey = true, IsIdentity = true)]
    public int Id { get; set; }

    [SugarColumn(Length = 128)]
    public string Text { get; set; } = string.Empty;

    [SugarColumn(Length = 128, IsNullable = true)]
    public string? Phonetic { get; set; }

    [SugarColumn(Length = 32, IsNullable = true)]
    public string? Pos { get; set; }

    [SugarColumn(Length = 512, IsNullable = true)]
    public string? Zh { get; set; }

    [SugarColumn(Length = 64, IsNullable = true)]
    public string? Topic { get; set; }

    public int Freq { get; set; }

    [Navigate(NavigateType.OneToMany, nameof(WordExample.WordId))]
    public List<WordExample>? Examples { get; set; }
}

[SugarTable("WordExamples")]
public class WordExample
{
    [SugarColumn(IsPrimaryKey = true, IsIdentity = true)]
    public int Id { get; set; }

    public int WordId { get; set; }

    [SugarColumn(ColumnDataType = "text")]
    public string Sentence { get; set; } = string.Empty;

    [SugarColumn(ColumnDataType = "text", IsNullable = true)]
    public string? Translation { get; set; }
}

[SugarTable("UserWordMastery")]
[SugarIndex("ux_mastery_user_word", nameof(UserId), OrderByType.Asc, nameof(WordId), OrderByType.Asc, true)]
public class UserWordMastery
{
    [SugarColumn(IsPrimaryKey = true, IsIdentity = true)]
    public int Id { get; set; }

    public int UserId { get; set; }
    public int WordId { get; set; }
    public int Mastery { get; set; }

    [SugarColumn(IsNullable = true)]
    public DateTime? NextReviewAt { get; set; }
}

/// <summary>
/// Translations for user-created rows, which cannot live in the front-end i18n
/// files because they did not exist when the bundle was built.
///
/// One generic table rather than a per-entity one: the alternative is a new
/// table and a new join every time something becomes translatable, and the
/// access pattern here is always the same — look up one field of one row in one
/// locale. Resolution order is: this table for the requested locale → the same
/// row's base column → the English fallback.
/// </summary>
[SugarTable("Translations")]
[SugarIndex("ux_translations", nameof(EntityType), OrderByType.Asc, nameof(EntityId), OrderByType.Asc,
    nameof(Field), OrderByType.Asc, nameof(Locale), OrderByType.Asc, true)]
public class Translation
{
    [SugarColumn(IsPrimaryKey = true, IsIdentity = true)]
    public int Id { get; set; }

    /// <summary>Table the row belongs to, e.g. <c>Categories</c>.</summary>
    [SugarColumn(Length = 32)]
    public string EntityType { get; set; } = string.Empty;

    public int EntityId { get; set; }

    /// <summary>Column being translated, e.g. <c>Name</c>.</summary>
    [SugarColumn(Length = 32)]
    public string Field { get; set; } = string.Empty;

    /// <summary>BCP-47 tag matching the UI locales: <c>en</c>, <c>zh-TW</c>, <c>zh-CN</c>.</summary>
    [SugarColumn(Length = 16)]
    public string Locale { get; set; } = string.Empty;

    [SugarColumn(ColumnDataType = "text")]
    public string Value { get; set; } = string.Empty;

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Catalogue of the local models the app offers for download — the tokenizer,
/// embedding and rerank models that let categorising and search work without
/// the cloud.
///
/// The catalogue is fixed and seeded from <c>ModelSeeds</c>; only
/// <see cref="Installed"/> and <see cref="InstalledAt"/> are runtime state.
/// Where the files land is deliberately NOT stored here — it differs per
/// runtime (desktop app-data, server volume) and is resolved by whichever
/// process owns the disk. See <c>ModelStorage</c>.
/// </summary>
[SugarTable("LocalModels")]
[SugarIndex("ux_localmodels_code", nameof(Code), OrderByType.Asc, true)]
public class LocalModelEntry
{
    [SugarColumn(IsPrimaryKey = true, IsIdentity = true)]
    public int Id { get; set; }

    /// <summary>Stable identifier and on-disk folder name, e.g. <c>bge-m3</c>.</summary>
    [SugarColumn(Length = 64)]
    public string Code { get; set; } = string.Empty;

    [SugarColumn(Length = 128)]
    public string Name { get; set; } = string.Empty;

    /// <summary>Token · Embed · Rerank</summary>
    [SugarColumn(Length = 16)]
    public string Kind { get; set; } = string.Empty;

    [SugarColumn(Length = 256)]
    public string Note { get; set; } = string.Empty;

    /// <summary>Download size in MB, as shown on the Models page.</summary>
    public int SizeMb { get; set; }

    /// <summary>Where to fetch it from. Not yet decided for every model.</summary>
    [SugarColumn(Length = 512, IsNullable = true)]
    public string? SourceUrl { get; set; }

    /// <summary>Checked after download when the source publishes a digest.</summary>
    [SugarColumn(Length = 64, IsNullable = true)]
    public string? Sha256 { get; set; }

    public int SortOrder { get; set; }

    public bool Installed { get; set; }

    [SugarColumn(IsNullable = true)]
    public DateTime? InstalledAt { get; set; }
}

/// <summary>
/// An AI prompt, stored rather than hard-coded so it can be revised without a
/// redeploy.
///
/// Authoring these well is difficult, so the app ships built-in versions
/// (<see cref="IsBuiltIn"/> = true, <see cref="CreatedBy"/> = null) that are
/// re-seeded on every start: improving a prompt in <c>PromptSeeds</c> rolls out
/// to everyone. A user may save their own row under the same
/// <see cref="Code"/>; resolution prefers the user's row and falls back to the
/// built-in one, and the built-in row is never overwritten by a user edit, so
/// "restore default" is always available.
/// </summary>
[SugarTable("PromptTemplates")]
[SugarIndex("ux_prompts_code_owner", nameof(Code), OrderByType.Asc, nameof(CreatedBy), OrderByType.Asc, true)]
public class PromptTemplate
{
    [SugarColumn(IsPrimaryKey = true, IsIdentity = true)]
    public int Id { get; set; }

    /// <summary>Stable lookup key, e.g. <c>segment.zh</c> or <c>text.intake</c>.</summary>
    [SugarColumn(Length = 64)]
    public string Code { get; set; } = string.Empty;

    [SugarColumn(Length = 128)]
    public string Name { get; set; } = string.Empty;

    [SugarColumn(Length = 512, IsNullable = true)]
    public string? Description { get; set; }

    [SugarColumn(ColumnDataType = "text")]
    public string Content { get; set; } = string.Empty;

    /// <summary>Which model the prompt was tuned against; advisory only.</summary>
    [SugarColumn(Length = 64, IsNullable = true)]
    public string? ModelHint { get; set; }

    /// <summary>Bumped whenever the seeded Content changes.</summary>
    public int Revision { get; set; } = 1;

    public bool IsBuiltIn { get; set; }

    /// <summary>Null for the shipped prompts; the owner's id for a user copy.</summary>
    [SugarColumn(IsNullable = true)]
    public int? CreatedBy { get; set; }

    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

[SugarTable("Achievements")]
[SugarIndex("ux_achievements_code", nameof(Code), OrderByType.Asc, true)]
public class Achievement
{
    [SugarColumn(IsPrimaryKey = true, IsIdentity = true)]
    public int Id { get; set; }

    [SugarColumn(Length = 64)]
    public string Code { get; set; } = string.Empty;

    [SugarColumn(Length = 128)]
    public string Name { get; set; } = string.Empty;

    public int Threshold { get; set; }
}

[SugarTable("UserAchievements")]
[SugarIndex("ux_userachievements", nameof(UserId), OrderByType.Asc, nameof(AchievementId), OrderByType.Asc, true)]
public class UserAchievement
{
    [SugarColumn(IsPrimaryKey = true, IsIdentity = true)]
    public int Id { get; set; }

    public int UserId { get; set; }
    public int AchievementId { get; set; }
    public DateTime UnlockedAt { get; set; } = DateTime.UtcNow;
}
