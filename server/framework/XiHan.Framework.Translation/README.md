# XiHan.Framework.Translation

## 概述

XiHan.Framework.Translation 提供文本翻译的统一入口，便于在多家翻译服务商之间择一并回退，调用方无需关心具体服务商。

## 核心能力

- 多服务商适配与调用的统一入口
- 语言标识与服务商语言代码的解耦
- 按配置顺序择一、失败自动回退
- 多目标语言并发翻译

## 依赖关系

- 本包只注册路由，不含任何服务商实现
- 服务商以 `TryAddEnumerable` 追加 `ITranslator` 注册，多家可共存
- 并入曦寒框架后由 `XiHanTranslationModule` 参与模块化生命周期，扩展方法保留供非模块化宿主使用

## 配置与约定

配置节为 `Translation`：

| 键                     | 说明                                                      | 默认   |
| ---------------------- | --------------------------------------------------------- | ------ |
| `Providers`            | 服务商优先顺序，取 `ITranslator.Name`；空则无需凭据者优先 | 空     |
| `Timeout`              | 单次翻译超时                                              | 15 秒  |
| `FallbackToSourceText` | 全部失败时是否以原文作为译文返回                          | `true` |

约定：

- 调用方只使用 `TranslationLanguage`，各服务商通过 `MapLanguage` 映射为自家代码
- 不支持的语言方向返回 `null`，路由据此跳过，不发出必然失败的请求
- 可恢复错误以失败结果返回而不抛异常，便于回退；取消与参数错误仍按常规抛出

## 使用方式

```csharp
services.AddXiHanTranslation(configuration);
services.AddXiHanOpenCcTranslator();      // 中文简繁，离线
services.AddXiHanGoogleTranslator(configuration);
```

一次录入补齐其余界面语言：

```csharp
var results = await translation.TranslateManyAsync(
    "打字練習",
    TranslationLanguage.ZhHant,
    [TranslationLanguage.ZhHans, TranslationLanguage.English]);
```

各目标语言并发执行且互不影响，需逐项检查 `IsSuccess`。

## 扩展点

实现 `ITranslator` 并以 `TryAddEnumerable` 注册即可接入新服务商：

```csharp
services.TryAddEnumerable(ServiceDescriptor.Singleton<ITranslator, MyTranslator>());
```

要点：

- `Name` 全局唯一且稳定，用于配置选择与结果溯源
- `IsBuiltIn` 表示无需凭据，未显式配置顺序时优先选用
- `IsConfigured` 为 false 时路由跳过，故缺少密钥不应抛异常
- `Supports` 应如实作答，避免把本该由他家处理的语言方向吞掉

## 目录结构

```text
XiHan.Framework.Translation/
  README.md
  XiHanTranslationServiceCollectionExtensions.cs
  Options/TranslationOptions.cs
  Routing/TranslationService.cs
```

## 已有服务商

| 包                                   | 标识     | 凭据 | 适用范围                             |
| ------------------------------------ | -------- | ---- | ------------------------------------ |
| `XiHan.Framework.Translation.OpenCC` | `opencc` | 不需 | 仅中文简繁互转，离线                 |
| `XiHan.Framework.Translation.Google` | `google` | 需要 | 通用，需 `Translation:Google:ApiKey` |

简繁互转刻意不走联网接口：它并非翻译而是确定性的字形与词汇映射，OpenCC 的台湾/香港配置本就处理词汇差异（软件↔軟體、网络↔網路），离线完成、可重现且无配额。
