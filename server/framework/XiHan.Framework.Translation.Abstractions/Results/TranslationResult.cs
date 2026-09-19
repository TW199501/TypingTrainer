// Copyright (c) 2021-Present XiHanFun and contributors.
// Licensed under the MIT License. See LICENSE in the project root for license information.

using XiHan.Framework.Translation.Abstractions.Languages;

namespace XiHan.Framework.Translation.Abstractions.Results;

/// <summary>
/// 翻译结果
/// </summary>
/// <remarks>
/// 失败不抛异常而是返回 <see cref="IsSuccess"/> 为 false 的结果。
/// 路由要在多个服务商之间回退，异常作为控制流既昂贵又会掩盖真正的故障。
/// </remarks>
public class TranslationResult
{
    /// <summary>
    /// 是否成功
    /// </summary>
    public bool IsSuccess { get; init; }

    /// <summary>
    /// 译文，失败时为空字符串
    /// </summary>
    public string Text { get; init; } = string.Empty;

    /// <summary>
    /// 实际检测到的源语言，服务商未返回时与请求一致
    /// </summary>
    public TranslationLanguage DetectedLanguage { get; init; } = TranslationLanguage.Auto;

    /// <summary>
    /// 实际产出译文的服务商标识
    /// </summary>
    /// <remarks>回退后与请求的服务商不同，调用方据此判断译文来源。</remarks>
    public string Provider { get; init; } = string.Empty;

    /// <summary>
    /// 耗时
    /// </summary>
    public TimeSpan Duration { get; init; }

    /// <summary>
    /// 失败原因，成功时为空
    /// </summary>
    public string? Error { get; init; }

    /// <summary>
    /// 构造成功结果
    /// </summary>
    /// <param name="text">译文</param>
    /// <param name="provider">服务商标识</param>
    /// <param name="duration">耗时</param>
    /// <param name="detected">检测到的源语言</param>
    /// <returns>成功结果</returns>
    public static TranslationResult Success(
        string text,
        string provider,
        TimeSpan duration = default,
        TranslationLanguage detected = TranslationLanguage.Auto)
    {
        return new TranslationResult
        {
            IsSuccess = true,
            Text = text,
            Provider = provider,
            Duration = duration,
            DetectedLanguage = detected
        };
    }

    /// <summary>
    /// 构造失败结果
    /// </summary>
    /// <param name="error">失败原因</param>
    /// <param name="provider">服务商标识</param>
    /// <param name="duration">耗时</param>
    /// <returns>失败结果</returns>
    public static TranslationResult Fail(string error, string provider, TimeSpan duration = default)
    {
        return new TranslationResult
        {
            IsSuccess = false,
            Error = error,
            Provider = provider,
            Duration = duration
        };
    }
}
