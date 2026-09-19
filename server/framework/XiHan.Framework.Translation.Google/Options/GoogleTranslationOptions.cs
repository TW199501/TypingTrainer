// Copyright (c) 2021-Present XiHanFun and contributors.
// Licensed under the MIT License. See LICENSE in the project root for license information.

namespace XiHan.Framework.Translation.Google.Options;

/// <summary>
/// 谷歌翻译选项
/// </summary>
public class GoogleTranslationOptions
{
    /// <summary>
    /// 配置节名称
    /// </summary>
    public const string SectionName = "Translation:Google";

    /// <summary>
    /// 接口密钥
    /// </summary>
    /// <remarks>
    /// 为空时本服务商视为未配置并被路由跳过，不会发出必然失败的请求。
    /// 切勿写入配置文件，应通过环境变量 <c>Translation__Google__ApiKey</c> 注入。
    /// </remarks>
    public string? ApiKey { get; set; }

    /// <summary>
    /// 接口地址
    /// </summary>
    /// <remarks>可改为兼容网关或自建代理。</remarks>
    public string Endpoint { get; set; } = "https://translation.googleapis.com/language/translate/v2";

    /// <summary>
    /// 请求超时
    /// </summary>
    public TimeSpan Timeout { get; set; } = TimeSpan.FromSeconds(15);
}
