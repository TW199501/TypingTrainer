// Copyright (c) 2021-Present XiHanFun and contributors.
// Licensed under the MIT License. See LICENSE in the project root for license information.

using System.Diagnostics;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using System.Web;
using Microsoft.Extensions.Options;
using XiHan.Framework.Translation.Abstractions;
using XiHan.Framework.Translation.Abstractions.Languages;
using XiHan.Framework.Translation.Abstractions.Requests;
using XiHan.Framework.Translation.Abstractions.Results;
using XiHan.Framework.Translation.Google.Options;

namespace XiHan.Framework.Translation.Google;

/// <summary>
/// 谷歌翻译服务商
/// </summary>
/// <remarks>
/// 对接 Cloud Translation v2。返回的译文带 HTML 实体转义，已在此解码。
/// </remarks>
public class GoogleTranslator : ITranslator
{
    /// <summary>
    /// 具名 HttpClient 名称
    /// </summary>
    public const string HttpClientName = "XiHan.Translation.Google";

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly GoogleTranslationOptions _options;

    /// <summary>
    /// 构造函数
    /// </summary>
    /// <param name="httpClientFactory">HttpClient 工厂</param>
    /// <param name="options">谷歌翻译选项</param>
    public GoogleTranslator(IHttpClientFactory httpClientFactory, IOptions<GoogleTranslationOptions> options)
    {
        _httpClientFactory = httpClientFactory;
        _options = options.Value;
    }

    /// <summary>
    /// 服务商标识
    /// </summary>
    public string Name => "google";

    /// <summary>
    /// 需要凭据
    /// </summary>
    public bool IsBuiltIn => false;

    /// <summary>
    /// 是否已配置密钥
    /// </summary>
    public bool IsConfigured => !string.IsNullOrWhiteSpace(_options.ApiKey);

    /// <summary>
    /// 将统一语言映射为谷歌的语言代码
    /// </summary>
    /// <param name="language">统一语言</param>
    /// <returns>语言代码，不支持时为 <see langword="null"/></returns>
    public string? MapLanguage(TranslationLanguage language)
    {
        return language switch
        {
            // 源语言留空即为自动检测。
            TranslationLanguage.Auto => string.Empty,
            TranslationLanguage.ZhHans => "zh-CN",
            TranslationLanguage.ZhHant => "zh-TW",
            // 谷歌不区分港台繁体，一并按台湾繁体处理。
            TranslationLanguage.ZhHantHk => "zh-TW",
            TranslationLanguage.English => "en",
            TranslationLanguage.Japanese => "ja",
            TranslationLanguage.Korean => "ko",
            TranslationLanguage.French => "fr",
            TranslationLanguage.German => "de",
            TranslationLanguage.Spanish => "es",
            TranslationLanguage.Russian => "ru",
            TranslationLanguage.Portuguese => "pt",
            TranslationLanguage.Italian => "it",
            TranslationLanguage.Vietnamese => "vi",
            TranslationLanguage.Thai => "th",
            TranslationLanguage.Arabic => "ar",
            _ => null
        };
    }

    /// <summary>
    /// 是否支持该语言方向
    /// </summary>
    /// <param name="source">源语言</param>
    /// <param name="target">目标语言</param>
    /// <returns>是否支持</returns>
    public bool Supports(TranslationLanguage source, TranslationLanguage target)
    {
        if (target == TranslationLanguage.Auto)
        {
            return false;
        }

        var mappedSource = MapLanguage(source);
        var mappedTarget = MapLanguage(target);

        if (mappedSource is null || string.IsNullOrEmpty(mappedTarget))
        {
            return false;
        }

        // 港台繁体都映射为 zh-TW，交给谷歌等同于原样返回，应留给 OpenCC 处理。
        return mappedSource != mappedTarget;
    }

    /// <summary>
    /// 翻译
    /// </summary>
    /// <param name="request">翻译请求</param>
    /// <param name="cancellationToken">取消令牌</param>
    /// <returns>翻译结果</returns>
    public async Task<TranslationResult> TranslateAsync(
        TranslationRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (!IsConfigured)
        {
            return TranslationResult.Fail("未配置 ApiKey。", Name);
        }

        var target = MapLanguage(request.TargetLanguage);
        if (string.IsNullOrEmpty(target))
        {
            return TranslationResult.Fail($"不支持的目标语言：{request.TargetLanguage}。", Name);
        }

        var stopwatch = Stopwatch.StartNew();

        try
        {
            var client = _httpClientFactory.CreateClient(HttpClientName);
            client.Timeout = _options.Timeout;

            var form = new Dictionary<string, string>
            {
                ["q"] = request.Text,
                ["target"] = target,
                ["format"] = "text"
            };

            var source = MapLanguage(request.SourceLanguage);
            if (!string.IsNullOrEmpty(source))
            {
                form["source"] = source;
            }

            // 密钥走查询串是 v2 接口的约定，不放入表单。
            var url = $"{_options.Endpoint}?key={Uri.EscapeDataString(_options.ApiKey!)}";

            using var content = new FormUrlEncodedContent(form);
            using var response = await client.PostAsync(url, content, cancellationToken).ConfigureAwait(false);

            if (!response.IsSuccessStatusCode)
            {
                var body = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
                stopwatch.Stop();
                return TranslationResult.Fail($"HTTP {(int)response.StatusCode}：{Truncate(body)}", Name, stopwatch.Elapsed);
            }

            var payload = await response.Content
                .ReadFromJsonAsync<GoogleResponse>(cancellationToken)
                .ConfigureAwait(false);

            stopwatch.Stop();

            var translation = payload?.Data?.Translations?.FirstOrDefault();
            if (translation?.TranslatedText is null)
            {
                return TranslationResult.Fail("响应中没有译文。", Name, stopwatch.Elapsed);
            }

            // v2 会把 & < > 等转义为 HTML 实体，即便 format 为 text。
            var text = HttpUtility.HtmlDecode(translation.TranslatedText);
            var detected = TranslationLanguageExtensions.FromBcp47(translation.DetectedSourceLanguage);

            return TranslationResult.Success(
                text,
                Name,
                stopwatch.Elapsed,
                detected == TranslationLanguage.Auto ? request.SourceLanguage : detected);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            return TranslationResult.Fail(ex.Message, Name, stopwatch.Elapsed);
        }
    }

    /// <summary>
    /// 截断错误正文，避免把整页响应写进日志
    /// </summary>
    /// <param name="value">正文</param>
    /// <returns>截断后的文本</returns>
    private static string Truncate(string value)
    {
        return value.Length <= 300 ? value : value[..300] + "…";
    }

    /// <summary>
    /// 谷歌翻译响应
    /// </summary>
    private sealed class GoogleResponse
    {
        /// <summary>
        /// 数据
        /// </summary>
        [JsonPropertyName("data")]
        public GoogleData? Data { get; set; }
    }

    /// <summary>
    /// 谷歌翻译数据
    /// </summary>
    private sealed class GoogleData
    {
        /// <summary>
        /// 译文集合
        /// </summary>
        [JsonPropertyName("translations")]
        public List<GoogleTranslation>? Translations { get; set; }
    }

    /// <summary>
    /// 谷歌翻译译文
    /// </summary>
    private sealed class GoogleTranslation
    {
        /// <summary>
        /// 译文
        /// </summary>
        [JsonPropertyName("translatedText")]
        public string? TranslatedText { get; set; }

        /// <summary>
        /// 检测到的源语言
        /// </summary>
        [JsonPropertyName("detectedSourceLanguage")]
        public string? DetectedSourceLanguage { get; set; }
    }
}
