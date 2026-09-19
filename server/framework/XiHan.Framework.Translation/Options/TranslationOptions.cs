// Copyright (c) 2021-Present XiHanFun and contributors.
// Licensed under the MIT License. See LICENSE in the project root for license information.

namespace XiHan.Framework.Translation.Options;

/// <summary>
/// 翻译选项
/// </summary>
public class TranslationOptions
{
    /// <summary>
    /// 配置节名称
    /// </summary>
    public const string SectionName = "Translation";

    /// <summary>
    /// 服务商优先顺序，取 <see cref="Abstractions.ITranslator.Name"/>
    /// </summary>
    /// <remarks>
    /// 为空时按注册顺序使用全部服务商，并优先无需凭据者。
    /// 显式配置可将离线转换排在联网接口之前，省去中文简繁互转的网络往返。
    /// </remarks>
    public IList<string> Providers { get; set; } = [];

    /// <summary>
    /// 单次翻译超时
    /// </summary>
    public TimeSpan Timeout { get; set; } = TimeSpan.FromSeconds(15);

    /// <summary>
    /// 全部服务商失败时是否以原文作为译文返回
    /// </summary>
    /// <remarks>
    /// 内容录入场景宜为 <see langword="true"/>：宁可某一语言暂时显示原文，
    /// 也好过整条记录保存失败。结果仍标记为失败，调用方可据此稍后重试。
    /// </remarks>
    public bool FallbackToSourceText { get; set; } = true;
}
