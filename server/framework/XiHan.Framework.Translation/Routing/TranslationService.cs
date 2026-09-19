// Copyright (c) 2021-Present XiHanFun and contributors.
// Licensed under the MIT License. See LICENSE in the project root for license information.

using System.Diagnostics;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using XiHan.Framework.Translation.Abstractions;
using XiHan.Framework.Translation.Abstractions.Languages;
using XiHan.Framework.Translation.Abstractions.Requests;
using XiHan.Framework.Translation.Abstractions.Results;
using XiHan.Framework.Translation.Options;

namespace XiHan.Framework.Translation.Routing;

/// <summary>
/// 默认翻译服务
/// </summary>
/// <remarks>
/// 按配置顺序择一服务商，失败即回退下一家。
/// </remarks>
public class TranslationService : ITranslationService
{
    private readonly IReadOnlyList<ITranslator> _translators;
    private readonly TranslationOptions _options;
    private readonly ILogger<TranslationService> _logger;

    /// <summary>
    /// 构造函数
    /// </summary>
    /// <param name="translators">已注册的服务商</param>
    /// <param name="options">翻译选项</param>
    /// <param name="logger">日志</param>
    public TranslationService(
        IEnumerable<ITranslator> translators,
        IOptions<TranslationOptions> options,
        ILogger<TranslationService> logger)
    {
        _options = options.Value;
        _logger = logger;
        _translators = Order([.. translators], _options.Providers);
    }

    /// <summary>
    /// 翻译为单一目标语言
    /// </summary>
    /// <param name="request">翻译请求</param>
    /// <param name="cancellationToken">取消令牌</param>
    /// <returns>翻译结果</returns>
    public async Task<TranslationResult> TranslateAsync(
        TranslationRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (request.TargetLanguage == TranslationLanguage.Auto)
        {
            throw new ArgumentException("目标语言不能为 Auto。", nameof(request));
        }

        // 源与目标一致时无需翻译，也不应计入服务商调用。
        if (request.SourceLanguage == request.TargetLanguage || string.IsNullOrWhiteSpace(request.Text))
        {
            return TranslationResult.Success(request.Text, "none");
        }

        var candidates = _translators
            .Where(t => t.IsConfigured && t.Supports(request.SourceLanguage, request.TargetLanguage))
            .ToList();

        if (candidates.Count == 0)
        {
            return Exhausted(request, "没有可用于该语言方向的服务商。");
        }

        var errors = new List<string>();

        foreach (var translator in candidates)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var stopwatch = Stopwatch.StartNew();
            try
            {
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                timeout.CancelAfter(_options.Timeout);

                var result = await translator.TranslateAsync(request, timeout.Token).ConfigureAwait(false);
                stopwatch.Stop();

                if (result.IsSuccess)
                {
                    return result.Duration == default
                        ? TranslationResult.Success(result.Text, translator.Name, stopwatch.Elapsed, result.DetectedLanguage)
                        : result;
                }

                errors.Add($"{translator.Name}: {result.Error}");
                _logger.LogWarning("翻译服务商 {Provider} 返回失败：{Error}", translator.Name, result.Error);
            }
            // 调用方主动取消时不再尝试其余服务商。
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            // 超时与服务商内部异常均视为该家不可用，继续回退。
            catch (Exception ex)
            {
                stopwatch.Stop();
                errors.Add($"{translator.Name}: {ex.Message}");
                _logger.LogWarning(ex, "翻译服务商 {Provider} 调用异常。", translator.Name);
            }
        }

        return Exhausted(request, string.Join("；", errors));
    }

    /// <summary>
    /// 翻译为多个目标语言
    /// </summary>
    /// <param name="text">待翻译文本</param>
    /// <param name="source">源语言</param>
    /// <param name="targets">目标语言集合</param>
    /// <param name="context">领域提示</param>
    /// <param name="cancellationToken">取消令牌</param>
    /// <returns>按目标语言归档的结果</returns>
    public async Task<IReadOnlyDictionary<TranslationLanguage, TranslationResult>> TranslateManyAsync(
        string text,
        TranslationLanguage source,
        IEnumerable<TranslationLanguage> targets,
        string? context = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(targets);

        var distinct = targets
            .Where(t => t != TranslationLanguage.Auto && t != source)
            .Distinct()
            .ToList();

        if (distinct.Count == 0)
        {
            return new Dictionary<TranslationLanguage, TranslationResult>();
        }

        var tasks = distinct.Select(async target =>
        {
            var request = new TranslationRequest(text, source, target) { Context = context };
            var result = await TranslateAsync(request, cancellationToken).ConfigureAwait(false);
            return (target, result);
        });

        var completed = await Task.WhenAll(tasks).ConfigureAwait(false);

        return completed.ToDictionary(x => x.target, x => x.result);
    }

    /// <summary>
    /// 依配置排定服务商顺序
    /// </summary>
    /// <param name="translators">已注册的服务商</param>
    /// <param name="preferred">配置的优先顺序</param>
    /// <returns>排序后的服务商</returns>
    private static IReadOnlyList<ITranslator> Order(IReadOnlyList<ITranslator> translators, IList<string> preferred)
    {
        if (preferred.Count == 0)
        {
            // 未配置时无需凭据者优先：它们不会因缺少密钥而失败，作兜底最稳妥。
            return [.. translators.OrderByDescending(t => t.IsBuiltIn)];
        }

        var rank = preferred
            .Select((name, index) => (name, index))
            .ToDictionary(x => x.name, x => x.index, StringComparer.OrdinalIgnoreCase);

        // 未列入配置者排在末尾，仍可作为最后的回退。
        return [.. translators.OrderBy(t => rank.TryGetValue(t.Name, out var i) ? i : int.MaxValue)];
    }

    /// <summary>
    /// 构造全部服务商失败后的结果
    /// </summary>
    /// <param name="request">翻译请求</param>
    /// <param name="error">失败原因</param>
    /// <returns>翻译结果</returns>
    private TranslationResult Exhausted(TranslationRequest request, string error)
    {
        _logger.LogError("翻译失败，目标语言 {Target}：{Error}", request.TargetLanguage, error);

        return _options.FallbackToSourceText
            ? new TranslationResult { IsSuccess = false, Text = request.Text, Provider = "none", Error = error }
            : TranslationResult.Fail(error, "none");
    }
}
