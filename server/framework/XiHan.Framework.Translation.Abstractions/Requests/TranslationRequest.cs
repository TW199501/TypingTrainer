// Copyright (c) 2021-Present XiHanFun and contributors.
// Licensed under the MIT License. See LICENSE in the project root for license information.

using XiHan.Framework.Translation.Abstractions.Languages;

namespace XiHan.Framework.Translation.Abstractions.Requests;

/// <summary>
/// 翻译请求
/// </summary>
/// <param name="Text">待翻译文本</param>
/// <param name="SourceLanguage">源语言，<see cref="TranslationLanguage.Auto"/> 表示交由服务商检测</param>
/// <param name="TargetLanguage">目标语言，不接受 <see cref="TranslationLanguage.Auto"/></param>
public record TranslationRequest(
    string Text,
    TranslationLanguage SourceLanguage,
    TranslationLanguage TargetLanguage)
{
    /// <summary>
    /// 领域提示，供大模型服务商理解上下文，例如「打字练习的分类名称」
    /// </summary>
    /// <remarks>
    /// 传统翻译接口会忽略本字段；大模型服务商可将其并入提示词，
    /// 以免短词被译成不相干的含义。
    /// </remarks>
    public string? Context { get; init; }
}
