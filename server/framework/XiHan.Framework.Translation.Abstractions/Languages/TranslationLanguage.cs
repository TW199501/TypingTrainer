// Copyright (c) 2021-Present XiHanFun and contributors.
// Licensed under the MIT License. See LICENSE in the project root for license information.

namespace XiHan.Framework.Translation.Abstractions.Languages;

/// <summary>
/// 翻译语言
/// </summary>
/// <remarks>
/// 统一的语言标识，不采用任何一家服务商的代码体系。
/// <para>
/// 各家的代码互不相同，同一种语言在 Google 是 <c>zh-TW</c>、在 DeepL 是 <c>ZH</c>、
/// 在百度是 <c>cht</c>。因此调用方只认本枚举，由各服务商实现
/// <see cref="ITranslator.MapLanguage"/> 自行映射，新增服务商不会影响调用方。
/// </para>
/// </remarks>
public enum TranslationLanguage
{
    /// <summary>
    /// 自动检测，仅可用于源语言
    /// </summary>
    Auto = 0,

    /// <summary>
    /// 简体中文
    /// </summary>
    ZhHans,

    /// <summary>
    /// 繁体中文（台湾）
    /// </summary>
    ZhHant,

    /// <summary>
    /// 繁体中文（香港）
    /// </summary>
    ZhHantHk,

    /// <summary>
    /// 英语
    /// </summary>
    English,

    /// <summary>
    /// 日语
    /// </summary>
    Japanese,

    /// <summary>
    /// 韩语
    /// </summary>
    Korean,

    /// <summary>
    /// 法语
    /// </summary>
    French,

    /// <summary>
    /// 德语
    /// </summary>
    German,

    /// <summary>
    /// 西班牙语
    /// </summary>
    Spanish,

    /// <summary>
    /// 俄语
    /// </summary>
    Russian,

    /// <summary>
    /// 葡萄牙语
    /// </summary>
    Portuguese,

    /// <summary>
    /// 意大利语
    /// </summary>
    Italian,

    /// <summary>
    /// 越南语
    /// </summary>
    Vietnamese,

    /// <summary>
    /// 泰语
    /// </summary>
    Thai,

    /// <summary>
    /// 阿拉伯语
    /// </summary>
    Arabic
}

/// <summary>
/// 翻译语言扩展
/// </summary>
public static class TranslationLanguageExtensions
{
    /// <summary>
    /// 转换为 BCP-47 标签，用于与前端界面语言对齐
    /// </summary>
    /// <param name="language">语言</param>
    /// <returns>BCP-47 标签，<see cref="TranslationLanguage.Auto"/> 返回空字符串</returns>
    public static string ToBcp47(this TranslationLanguage language)
    {
        return language switch
        {
            TranslationLanguage.Auto => string.Empty,
            TranslationLanguage.ZhHans => "zh-CN",
            TranslationLanguage.ZhHant => "zh-TW",
            TranslationLanguage.ZhHantHk => "zh-HK",
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
            _ => string.Empty
        };
    }

    /// <summary>
    /// 从 BCP-47 标签解析语言，无法识别时返回 <see cref="TranslationLanguage.Auto"/>
    /// </summary>
    /// <param name="tag">BCP-47 标签，大小写不敏感</param>
    /// <returns>语言</returns>
    public static TranslationLanguage FromBcp47(string? tag)
    {
        if (string.IsNullOrWhiteSpace(tag))
        {
            return TranslationLanguage.Auto;
        }

        return tag.Trim().Replace('_', '-').ToLowerInvariant() switch
        {
            "zh-cn" or "zh-hans" or "zh-sg" or "zh" => TranslationLanguage.ZhHans,
            "zh-tw" or "zh-hant" => TranslationLanguage.ZhHant,
            "zh-hk" or "zh-mo" => TranslationLanguage.ZhHantHk,
            "en" or "en-us" or "en-gb" => TranslationLanguage.English,
            "ja" or "ja-jp" => TranslationLanguage.Japanese,
            "ko" or "ko-kr" => TranslationLanguage.Korean,
            "fr" => TranslationLanguage.French,
            "de" => TranslationLanguage.German,
            "es" => TranslationLanguage.Spanish,
            "ru" => TranslationLanguage.Russian,
            "pt" => TranslationLanguage.Portuguese,
            "it" => TranslationLanguage.Italian,
            "vi" => TranslationLanguage.Vietnamese,
            "th" => TranslationLanguage.Thai,
            "ar" => TranslationLanguage.Arabic,
            _ => TranslationLanguage.Auto
        };
    }

    /// <summary>
    /// 是否为中文，含简繁各变体
    /// </summary>
    /// <param name="language">语言</param>
    /// <returns>是否为中文</returns>
    public static bool IsChinese(this TranslationLanguage language)
    {
        return language is TranslationLanguage.ZhHans or TranslationLanguage.ZhHant or TranslationLanguage.ZhHantHk;
    }
}
