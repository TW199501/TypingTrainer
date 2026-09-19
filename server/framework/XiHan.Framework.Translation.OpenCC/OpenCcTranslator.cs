// Copyright (c) 2021-Present XiHanFun and contributors.
// Licensed under the MIT License. See LICENSE in the project root for license information.

using System.Diagnostics;
using OpenCCNET;
using XiHan.Framework.Translation.Abstractions;
using XiHan.Framework.Translation.Abstractions.Languages;
using XiHan.Framework.Translation.Abstractions.Requests;
using XiHan.Framework.Translation.Abstractions.Results;

namespace XiHan.Framework.Translation.OpenCC;

/// <summary>
/// 中文简繁转换服务商
/// </summary>
/// <remarks>
/// 仅处理中文各变体之间的互转，其余语言方向一律交由联网服务商。
/// <para>
/// 简繁之间并非翻译而是确定性的字形与词汇映射，走联网翻译接口既要付费与配额，
/// 又多一次网络往返，且结果未必更准。OpenCC 的台湾/香港配置本就处理词汇差异
/// （软件↔軟體、网络↔網路），离线完成且可重现。
/// </para>
/// </remarks>
public class OpenCcTranslator : ITranslator
{
    private static readonly object InitLock = new();
    private static bool _initialized;

    /// <summary>
    /// 构造函数
    /// </summary>
    public OpenCcTranslator()
    {
        EnsureInitialized();
    }

    /// <summary>
    /// 服务商标识
    /// </summary>
    public string Name => "opencc";

    /// <summary>
    /// 无需凭据
    /// </summary>
    public bool IsBuiltIn => true;

    /// <summary>
    /// 始终可用，词典随包分发
    /// </summary>
    public bool IsConfigured => true;

    /// <summary>
    /// 将统一语言映射为本服务商的语言代码
    /// </summary>
    /// <param name="language">统一语言</param>
    /// <returns>语言代码，非中文时为 <see langword="null"/></returns>
    public string? MapLanguage(TranslationLanguage language)
    {
        return language switch
        {
            TranslationLanguage.ZhHans => "hans",
            TranslationLanguage.ZhHant => "tw",
            TranslationLanguage.ZhHantHk => "hk",
            _ => null
        };
    }

    /// <summary>
    /// 是否支持该语言方向
    /// </summary>
    /// <param name="source">源语言</param>
    /// <param name="target">目标语言</param>
    /// <returns>是否支持</returns>
    /// <remarks>
    /// 源语言为 <see cref="TranslationLanguage.Auto"/> 时不予受理：本服务商不做语种检测，
    /// 若把英文按简繁转换处理会原样返回并掩盖真正该走的服务商。
    /// </remarks>
    public bool Supports(TranslationLanguage source, TranslationLanguage target)
    {
        return source.IsChinese() && target.IsChinese() && source != target;
    }

    /// <summary>
    /// 转换
    /// </summary>
    /// <param name="request">翻译请求</param>
    /// <param name="cancellationToken">取消令牌</param>
    /// <returns>翻译结果</returns>
    public Task<TranslationResult> TranslateAsync(
        TranslationRequest request,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(request);
        cancellationToken.ThrowIfCancellationRequested();

        if (!Supports(request.SourceLanguage, request.TargetLanguage))
        {
            return Task.FromResult(TranslationResult.Fail(
                $"不支持的语言方向：{request.SourceLanguage} → {request.TargetLanguage}。", Name));
        }

        var stopwatch = Stopwatch.StartNew();

        try
        {
            var text = Convert(request.Text, request.SourceLanguage, request.TargetLanguage);
            stopwatch.Stop();

            return Task.FromResult(TranslationResult.Success(text, Name, stopwatch.Elapsed, request.SourceLanguage));
        }
        catch (Exception ex)
        {
            stopwatch.Stop();
            return Task.FromResult(TranslationResult.Fail(ex.Message, Name, stopwatch.Elapsed));
        }
    }

    /// <summary>
    /// 执行简繁转换
    /// </summary>
    /// <param name="text">文本</param>
    /// <param name="source">源语言</param>
    /// <param name="target">目标语言</param>
    /// <returns>转换后的文本</returns>
    private static string Convert(string text, TranslationLanguage source, TranslationLanguage target)
    {
        return (source, target) switch
        {
            // 启用词汇转换，令「软件」成为「軟體」而非「軟件」。
            (TranslationLanguage.ZhHans, TranslationLanguage.ZhHant) => ZhConverter.HansToTW(text, true),
            (TranslationLanguage.ZhHans, TranslationLanguage.ZhHantHk) => ZhConverter.HansToHK(text),
            (TranslationLanguage.ZhHant, TranslationLanguage.ZhHans) => ZhConverter.TWToHans(text, true),
            (TranslationLanguage.ZhHantHk, TranslationLanguage.ZhHans) => ZhConverter.HKToHans(text),
            (TranslationLanguage.ZhHant, TranslationLanguage.ZhHantHk) => ZhConverter.HansToHK(ZhConverter.TWToHans(text, true)),
            (TranslationLanguage.ZhHantHk, TranslationLanguage.ZhHant) => ZhConverter.HansToTW(ZhConverter.HKToHans(text), true),
            _ => text
        };
    }

    /// <summary>
    /// 初始化词典，仅执行一次
    /// </summary>
    /// <remarks>
    /// 必须显式传入资源目录。OpenCCNET 的无参重载按当前工作目录解析
    /// <c>Dictionary</c> 与 <c>JiebaResource</c>，而两者实际随程序集输出；
    /// 单元测试的工作目录恰为输出目录故能通过，宿主进程（如 <c>dotnet run</c>，
    /// 其工作目录为项目根）则会抛出目录不存在。改以
    /// <see cref="AppContext.BaseDirectory"/> 为基准，与工作目录无关。
    /// <para>词汇级转换（軟體／软件）依赖结巴分词，故 JiebaResource 不可缺省。</para>
    /// </remarks>
    private static void EnsureInitialized()
    {
        if (_initialized)
        {
            return;
        }

        lock (InitLock)
        {
            if (_initialized)
            {
                return;
            }

            var baseDirectory = AppContext.BaseDirectory;

            ZhConverter.Initialize(
                Path.Combine(baseDirectory, "Dictionary"),
                Path.Combine(baseDirectory, "JiebaResource"));

            _initialized = true;
        }
    }
}
