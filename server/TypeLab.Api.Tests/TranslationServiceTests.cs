using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using XiHan.Framework.Translation.Abstractions;
using XiHan.Framework.Translation.Abstractions.Languages;
using XiHan.Framework.Translation.Abstractions.Requests;
using XiHan.Framework.Translation.Abstractions.Results;
using XiHan.Framework.Translation.Options;
using XiHan.Framework.Translation.Routing;

namespace TypeLab.Api.Tests;

public class TranslationServiceTests
{
    /// <summary>Configurable stand-in for a provider; records whether it was called.</summary>
    private sealed class FakeTranslator(
        string name,
        bool succeeds = true,
        bool configured = true,
        bool builtIn = false,
        bool supports = true) : ITranslator
    {
        public string Name { get; } = name;
        public bool IsBuiltIn { get; } = builtIn;
        public bool IsConfigured { get; } = configured;
        public int Calls { get; private set; }

        public string? MapLanguage(TranslationLanguage language) => supports ? language.ToBcp47() : null;

        public bool Supports(TranslationLanguage source, TranslationLanguage target) => supports;

        public Task<TranslationResult> TranslateAsync(TranslationRequest request, CancellationToken ct = default)
        {
            Calls++;
            return Task.FromResult(succeeds
                ? TranslationResult.Success($"[{Name}]{request.Text}", Name)
                : TranslationResult.Fail("boom", Name));
        }
    }

    private static TranslationService Build(IEnumerable<ITranslator> translators, TranslationOptions? options = null)
    {
        return new TranslationService(
            translators,
            Options.Create(options ?? new TranslationOptions()),
            NullLogger<TranslationService>.Instance);
    }

    private static TranslationRequest Request(string text = "測試")
    {
        return new TranslationRequest(text, TranslationLanguage.ZhHant, TranslationLanguage.English);
    }

    [Fact]
    public async Task Uses_the_configured_order()
    {
        var first = new FakeTranslator("alpha");
        var second = new FakeTranslator("beta");

        var service = Build([first, second], new TranslationOptions { Providers = ["beta", "alpha"] });
        var result = await service.TranslateAsync(Request());

        Assert.Equal("beta", result.Provider);
        Assert.Equal(1, second.Calls);
        Assert.Equal(0, first.Calls);
    }

    [Fact]
    public async Task Falls_back_to_the_next_provider_when_one_fails()
    {
        var broken = new FakeTranslator("broken", succeeds: false);
        var working = new FakeTranslator("working");

        var service = Build([broken, working], new TranslationOptions { Providers = ["broken", "working"] });
        var result = await service.TranslateAsync(Request());

        Assert.True(result.IsSuccess);
        Assert.Equal("working", result.Provider);
        Assert.Equal(1, broken.Calls);
    }

    /// <summary>An unconfigured provider must not be called — the request would fail for certain.</summary>
    [Fact]
    public async Task Skips_unconfigured_providers()
    {
        var unconfigured = new FakeTranslator("nokey", configured: false);
        var working = new FakeTranslator("working");

        var service = Build([unconfigured, working], new TranslationOptions { Providers = ["nokey", "working"] });
        var result = await service.TranslateAsync(Request());

        Assert.Equal(0, unconfigured.Calls);
        Assert.Equal("working", result.Provider);
    }

    [Fact]
    public async Task Skips_providers_that_do_not_support_the_direction()
    {
        var wrongDirection = new FakeTranslator("narrow", supports: false);
        var working = new FakeTranslator("working");

        var service = Build([wrongDirection, working], new TranslationOptions { Providers = ["narrow", "working"] });
        var result = await service.TranslateAsync(Request());

        Assert.Equal(0, wrongDirection.Calls);
        Assert.True(result.IsSuccess);
    }

    /// <summary>With no explicit order, credential-free providers go first.</summary>
    [Fact]
    public async Task Prefers_builtin_providers_when_unordered()
    {
        var paid = new FakeTranslator("paid");
        var free = new FakeTranslator("free", builtIn: true);

        var service = Build([paid, free]);
        var result = await service.TranslateAsync(Request());

        Assert.Equal("free", result.Provider);
        Assert.Equal(0, paid.Calls);
    }

    [Fact]
    public async Task Returns_the_source_text_when_every_provider_fails()
    {
        var broken = new FakeTranslator("broken", succeeds: false);

        var service = Build([broken], new TranslationOptions { FallbackToSourceText = true });
        var result = await service.TranslateAsync(Request("原文"));

        Assert.False(result.IsSuccess);
        Assert.Equal("原文", result.Text);
        Assert.NotNull(result.Error);
    }

    [Fact]
    public async Task Returns_empty_text_when_fallback_is_disabled()
    {
        var broken = new FakeTranslator("broken", succeeds: false);

        var service = Build([broken], new TranslationOptions { FallbackToSourceText = false });
        var result = await service.TranslateAsync(Request("原文"));

        Assert.False(result.IsSuccess);
        Assert.Equal(string.Empty, result.Text);
    }

    [Fact]
    public async Task Same_source_and_target_short_circuits()
    {
        var translator = new FakeTranslator("any");
        var service = Build([translator]);

        var result = await service.TranslateAsync(
            new TranslationRequest("不變", TranslationLanguage.English, TranslationLanguage.English));

        Assert.True(result.IsSuccess);
        Assert.Equal("不變", result.Text);
        Assert.Equal(0, translator.Calls);
    }

    [Fact]
    public async Task Target_auto_is_rejected()
    {
        var service = Build([new FakeTranslator("any")]);

        await Assert.ThrowsAsync<ArgumentException>(() => service.TranslateAsync(
            new TranslationRequest("x", TranslationLanguage.ZhHant, TranslationLanguage.Auto)));
    }

    /// <summary>
    /// The content-entry case: type once in Traditional, get the other two UI
    /// locales filled in.
    /// </summary>
    [Fact]
    public async Task TranslateMany_fills_the_remaining_locales()
    {
        var service = Build([new FakeTranslator("any", builtIn: true)]);

        var results = await service.TranslateManyAsync(
            "打字練習",
            TranslationLanguage.ZhHant,
            [TranslationLanguage.ZhHans, TranslationLanguage.English, TranslationLanguage.ZhHant]);

        // The source language is dropped rather than translated into itself.
        Assert.Equal(2, results.Count);
        Assert.True(results[TranslationLanguage.ZhHans].IsSuccess);
        Assert.True(results[TranslationLanguage.English].IsSuccess);
        Assert.DoesNotContain(TranslationLanguage.ZhHant, results.Keys);
    }

    [Fact]
    public async Task TranslateMany_isolates_a_failing_target()
    {
        // Supports everything, but always fails: every target ends up failed
        // independently rather than one exception aborting the batch.
        var service = Build(
            [new FakeTranslator("broken", succeeds: false)],
            new TranslationOptions { FallbackToSourceText = true });

        var results = await service.TranslateManyAsync(
            "原文",
            TranslationLanguage.ZhHant,
            [TranslationLanguage.ZhHans, TranslationLanguage.English]);

        Assert.Equal(2, results.Count);
        Assert.All(results.Values, r => Assert.False(r.IsSuccess));
        Assert.All(results.Values, r => Assert.Equal("原文", r.Text));
    }
}
