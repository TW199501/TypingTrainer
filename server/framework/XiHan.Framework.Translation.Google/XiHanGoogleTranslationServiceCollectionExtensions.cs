// Copyright (c) 2021-Present XiHanFun and contributors.
// Licensed under the MIT License. See LICENSE in the project root for license information.

using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using XiHan.Framework.Translation.Abstractions;
using XiHan.Framework.Translation.Google.Options;

namespace XiHan.Framework.Translation.Google;

/// <summary>
/// 曦寒框架谷歌翻译服务扩展
/// </summary>
public static class XiHanGoogleTranslationServiceCollectionExtensions
{
    /// <summary>
    /// 注册谷歌翻译服务商
    /// </summary>
    /// <remarks>
    /// 未配置 ApiKey 时仍会注册，但 <see cref="ITranslator.IsConfigured"/> 为 false，
    /// 路由将其跳过。如此可在不改动注册代码的前提下，仅凭环境变量启停本服务商。
    /// </remarks>
    /// <param name="services">服务集合</param>
    /// <param name="configuration">配置</param>
    /// <returns>服务集合</returns>
    public static IServiceCollection AddXiHanGoogleTranslator(this IServiceCollection services, IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);

        services.Configure<GoogleTranslationOptions>(configuration.GetSection(GoogleTranslationOptions.SectionName));
        services.AddHttpClient(GoogleTranslator.HttpClientName);
        services.TryAddEnumerable(ServiceDescriptor.Singleton<ITranslator, GoogleTranslator>());

        return services;
    }
}
