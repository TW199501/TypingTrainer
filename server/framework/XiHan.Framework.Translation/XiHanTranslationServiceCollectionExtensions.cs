// Copyright (c) 2021-Present XiHanFun and contributors.
// Licensed under the MIT License. See LICENSE in the project root for license information.

using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using XiHan.Framework.Translation.Abstractions;
using XiHan.Framework.Translation.Options;
using XiHan.Framework.Translation.Routing;

namespace XiHan.Framework.Translation;

/// <summary>
/// 曦寒框架翻译服务扩展
/// </summary>
/// <remarks>
/// 本包只注册路由，不含任何服务商。接入具体服务商时引用对应的实现包，
/// 各自以 <c>TryAddEnumerable</c> 追加 <see cref="ITranslator"/> 的注册，
/// 因此多家服务商可以共存并按配置顺序回退。
/// <para>
/// 并入曦寒框架后，此处逻辑由 <c>XiHanTranslationModule</c> 在
/// <c>ConfigureServices</c> 中调用，扩展方法保留供非模块化宿主使用。
/// </para>
/// </remarks>
public static class XiHanTranslationServiceCollectionExtensions
{
    /// <summary>
    /// 注册翻译服务
    /// </summary>
    /// <param name="services">服务集合</param>
    /// <param name="configuration">配置</param>
    /// <returns>服务集合</returns>
    public static IServiceCollection AddXiHanTranslation(this IServiceCollection services, IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);

        services.Configure<TranslationOptions>(configuration.GetSection(TranslationOptions.SectionName));
        services.TryAddSingleton<ITranslationService, TranslationService>();

        return services;
    }

    /// <summary>
    /// 注册翻译服务并就地配置选项
    /// </summary>
    /// <param name="services">服务集合</param>
    /// <param name="configure">选项配置</param>
    /// <returns>服务集合</returns>
    public static IServiceCollection AddXiHanTranslation(this IServiceCollection services, Action<TranslationOptions> configure)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configure);

        services.Configure(configure);
        services.TryAddSingleton<ITranslationService, TranslationService>();

        return services;
    }
}
