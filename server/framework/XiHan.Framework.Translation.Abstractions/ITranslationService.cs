// Copyright (c) 2021-Present XiHanFun and contributors.
// Licensed under the MIT License. See LICENSE in the project root for license information.

using XiHan.Framework.Translation.Abstractions.Languages;
using XiHan.Framework.Translation.Abstractions.Requests;
using XiHan.Framework.Translation.Abstractions.Results;

namespace XiHan.Framework.Translation.Abstractions;

/// <summary>
/// 翻译服务
/// </summary>
/// <remarks>
/// 调用方的入口，在已注册的 <see cref="ITranslator"/> 之间按配置顺序择一并在失败时回退，
/// 使调用方无需关心具体服务商。
/// </remarks>
public interface ITranslationService
{
    /// <summary>
    /// 翻译为单一目标语言
    /// </summary>
    /// <param name="request">翻译请求</param>
    /// <param name="cancellationToken">取消令牌</param>
    /// <returns>翻译结果，全部服务商均不可用时为失败结果</returns>
    Task<TranslationResult> TranslateAsync(TranslationRequest request, CancellationToken cancellationToken = default);

    /// <summary>
    /// 翻译为多个目标语言
    /// </summary>
    /// <remarks>
    /// 各目标语言并发执行且互不影响，单个语言失败不会拖垮其余语言，
    /// 因此返回值需逐项检查 <see cref="TranslationResult.IsSuccess"/>。
    /// <para>
    /// 典型场景为内容录入：用户以繁体填写一次，其余界面语言就地补齐。
    /// </para>
    /// </remarks>
    /// <param name="text">待翻译文本</param>
    /// <param name="source">源语言</param>
    /// <param name="targets">目标语言集合，与源语言相同者将被跳过</param>
    /// <param name="context">领域提示，供大模型服务商理解上下文</param>
    /// <param name="cancellationToken">取消令牌</param>
    /// <returns>按目标语言归档的结果</returns>
    Task<IReadOnlyDictionary<TranslationLanguage, TranslationResult>> TranslateManyAsync(
        string text,
        TranslationLanguage source,
        IEnumerable<TranslationLanguage> targets,
        string? context = null,
        CancellationToken cancellationToken = default);
}
