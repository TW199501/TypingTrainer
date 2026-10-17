using System.Text.Json.Serialization;

namespace TypeLab.Api.Api;

public record SubCategoryDto(string Id, string Name, int Count, bool IsBuiltIn);

public record CategoryDto(
    string Id,
    string Name,
    string Color,
    string Layout,
    string Kind,
    bool IsBuiltIn,
    List<SubCategoryDto> Children);

public record TextDto(
    int Id,
    string Title,
    string Category,
    string Sub,
    string CategoryId,
    string SubId,
    string Level,
    int Chars,
    int? Best,
    string? LastPractisedAt,
    bool IsBuiltIn,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Content);

/// <summary><paramref name="Level"/> is <c>top</c> or <c>sub</c>; a sub needs <paramref name="ParentId"/>.</summary>
public record CreateCategoryRequest(string Level, string? ParentId, string Name, string? Color);

public record RenameCategoryRequest(string Name);

public record CreateTextRequest(
    string Title,
    string Content,
    string? CategoryId,
    string? Sub,
    string? Level,
    string? FileName);

public record ImportTextsRequest(List<CreateTextRequest> Texts);

public record TextPage(List<TextDto> Rows, int Total);

public record DictEntryDto(
    int Id,
    string Word,
    string Phonetic,
    string Pos,
    string Zh,
    string Topic,
    string Example,
    int Mastery);

public record ImportWordRow(
    string Word,
    string? Zh,
    string? Phonetic,
    string? Pos,
    string? Topic,
    string? Example);

public record ImportWordsRequest(bool SkipDuplicates, List<ImportWordRow> Words);

public record ImportWordsResult(int Added, int Skipped);
