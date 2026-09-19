using XiHan.Framework.Translation.Abstractions.Languages;
using XiHan.Framework.Translation.Abstractions.Requests;
using XiHan.Framework.Translation.OpenCC;

namespace TypeLab.Api.Tests;

public class OpenCcTranslatorTests
{
    private readonly OpenCcTranslator _translator = new();

    [Fact]
    public async Task Simplified_to_traditional()
    {
        var result = await _translator.TranslateAsync(
            new TranslationRequest("打字练习", TranslationLanguage.ZhHans, TranslationLanguage.ZhHant));

        Assert.True(result.IsSuccess);
        Assert.Equal("打字練習", result.Text);
        Assert.Equal("opencc", result.Provider);
    }

    [Fact]
    public async Task Traditional_to_simplified()
    {
        var result = await _translator.TranslateAsync(
            new TranslationRequest("打字練習", TranslationLanguage.ZhHant, TranslationLanguage.ZhHans));

        Assert.True(result.IsSuccess);
        Assert.Equal("打字练习", result.Text);
    }

    /// <summary>
    /// The reason OpenCC beats a generic translate call here: it converts
    /// vocabulary, not just glyphs. A naive character map would produce 軟件.
    /// </summary>
    [Theory]
    [InlineData("软件", "軟體")]
    [InlineData("网络", "網路")]
    public async Task Converts_vocabulary_not_just_glyphs(string simplified, string traditional)
    {
        var result = await _translator.TranslateAsync(
            new TranslationRequest(simplified, TranslationLanguage.ZhHans, TranslationLanguage.ZhHant));

        Assert.True(result.IsSuccess);
        Assert.Equal(traditional, result.Text);
    }

    [Fact]
    public void Does_not_claim_non_chinese_directions()
    {
        Assert.False(_translator.Supports(TranslationLanguage.ZhHant, TranslationLanguage.English));
        Assert.False(_translator.Supports(TranslationLanguage.English, TranslationLanguage.ZhHans));
    }

    /// <summary>
    /// Auto means "detect the language", which this provider cannot do. Claiming
    /// support would swallow English text and return it unchanged, hiding the
    /// fact that a real translator should have handled it.
    /// </summary>
    [Fact]
    public void Does_not_claim_auto_source()
    {
        Assert.False(_translator.Supports(TranslationLanguage.Auto, TranslationLanguage.ZhHant));
    }

    [Fact]
    public void Does_not_claim_a_no_op_direction()
    {
        Assert.False(_translator.Supports(TranslationLanguage.ZhHant, TranslationLanguage.ZhHant));
    }

    [Fact]
    public void Is_usable_without_credentials()
    {
        Assert.True(_translator.IsBuiltIn);
        Assert.True(_translator.IsConfigured);
    }

    /// <summary>
    /// Regression: OpenCCNET resolves its dictionary and jieba resources
    /// relative to the current directory. Tests happen to run from the output
    /// directory, so the bug stayed invisible here while the API — whose
    /// working directory is the project root — threw on start-up. Initialisation
    /// must key off AppContext.BaseDirectory instead.
    /// </summary>
    [Fact]
    public async Task Works_when_the_current_directory_is_not_the_output_directory()
    {
        var original = Directory.GetCurrentDirectory();
        try
        {
            Directory.SetCurrentDirectory(Path.GetTempPath());

            var result = await new OpenCcTranslator().TranslateAsync(
                new TranslationRequest("软件", TranslationLanguage.ZhHans, TranslationLanguage.ZhHant));

            Assert.True(result.IsSuccess);
            Assert.Equal("軟體", result.Text);
        }
        finally
        {
            Directory.SetCurrentDirectory(original);
        }
    }

    [Fact]
    public async Task Unsupported_direction_fails_instead_of_returning_the_input()
    {
        var result = await _translator.TranslateAsync(
            new TranslationRequest("hello", TranslationLanguage.English, TranslationLanguage.ZhHant));

        Assert.False(result.IsSuccess);
        Assert.NotNull(result.Error);
    }
}
