// Copyright (c) 2021-Present XiHanFun and contributors.
// Licensed under the MIT License. See LICENSE in the project root for license information.

using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using XiHan.Framework.Translation.Abstractions;

namespace XiHan.Framework.Translation.OpenCC;

/// <summary>
/// 曦寒框架简繁转换服务扩展
/// </summary>
public static class XiHanOpenCcTranslationServiceCollectionExtensions
{
    /// <summary>
    /// 注册简繁转换服务商
    /// </summary>
    /// <remarks>
    /// 以 <c>TryAddEnumerable</c> 追加而非替换，与其余服务商共存；
    /// 因其无需凭据，未显式配置顺序时会被优先选用。
    /// 单例注册：词典加载一次即可，且转换本身无状态。
    /// </remarks>
    /// <param name="services">服务集合</param>
    /// <returns>服务集合</returns>
    public static IServiceCollection AddXiHanOpenCcTranslator(this IServiceCollection services)
    {
        ArgumentNullException.ThrowIfNull(services);

        services.TryAddEnumerable(ServiceDescriptor.Singleton<ITranslator, OpenCcTranslator>());

        return services;
    }
}
