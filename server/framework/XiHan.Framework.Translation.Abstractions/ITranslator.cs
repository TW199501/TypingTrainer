// Copyright (c) 2021-Present XiHanFun and contributors.
// Licensed under the MIT License. See LICENSE in the project root for license information.

using XiHan.Framework.Translation.Abstractions.Languages;
using XiHan.Framework.Translation.Abstractions.Requests;
using XiHan.Framework.Translation.Abstractions.Results;

namespace XiHan.Framework.Translation.Abstractions;

/// <summary>
/// 翻译服务商
/// </summary>
/// <remarks>
/// 契约按「在线接口与离线转换都能落地」的交集设计，签名中不出现任一服务商的类型。
/// <para>
/// 语言语义：调用方只使用 <see cref="TranslationLanguage"/>，各服务商通过
/// <see cref="MapLanguage"/> 映射为自家代码；不支持的语言返回 <see langword="null"/>，
/// 路由据此跳过该服务商而非发出必然失败的请求。
/// </para>
/// <para>
/// 失败语义：<see cref="TranslateAsync"/> 以失败结果返回可恢复错误，不抛异常，
/// 以便路由回退到下一家。取消与参数错误仍按常规抛出。
/// </para>
/// </remarks>
public interface ITranslator
{
    /// <summary>
    /// 服务商标识，全局唯一且稳定，用于配置选择与结果溯源
    /// </summary>
    /// <remarks>例如 <c>google</c>、<c>deepl</c>、<c>chinese-script</c>。</remarks>
    string Name { get; }

    /// <summary>
    /// 是否无需凭据即可使用
    /// </summary>
    /// <remarks>
    /// 离线转换与免密接口为 <see langword="true"/>，可直接作为兜底；
    /// 需要密钥的服务商在未配置时不应被路由选中。
    /// </remarks>
    bool IsBuiltIn { get; }

    /// <summary>
    /// 当前配置是否可用
    /// </summary>
    /// <remarks>缺少密钥或端点时返回 <see langword="false"/>，路由将跳过本服务商。</remarks>
    bool IsConfigured { get; }

    /// <summary>
    /// 将统一语言映射为本服务商的语言代码
    /// </summary>
    /// <param name="language">统一语言</param>
    /// <returns>服务商语言代码，不支持时为 <see langword="null"/></returns>
    string? MapLanguage(TranslationLanguage language);

    /// <summary>
    /// 是否支持该语言方向
    /// </summary>
    /// <param name="source">源语言</param>
    /// <param name="target">目标语言</param>
    /// <returns>是否支持</returns>
    bool Supports(TranslationLanguage source, TranslationLanguage target);

    /// <summary>
    /// 翻译
    /// </summary>
    /// <param name="request">翻译请求</param>
    /// <param name="cancellationToken">取消令牌</param>
    /// <returns>翻译结果，失败时 <see cref="TranslationResult.IsSuccess"/> 为 false</returns>
    Task<TranslationResult> TranslateAsync(TranslationRequest request, CancellationToken cancellationToken = default);
}
