using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using TypeLab.Api.Data;

namespace TypeLab.Api.Tests;

public class ModelStorageTests
{
    private sealed class FakeEnv : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = "Test";
        public string ApplicationName { get; set; } = "TypeLab.Api.Tests";
        public string ContentRootPath { get; set; } = Path.GetTempPath();
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }

    private static ModelStorage Build(string? directory, string? contentRoot = null)
    {
        var config = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Models:Directory"] = directory })
            .Build();

        return new ModelStorage(config, new FakeEnv { ContentRootPath = contentRoot ?? Path.GetTempPath() });
    }

    [Fact]
    public void Absolute_configured_path_is_used_verbatim()
    {
        var absolute = OperatingSystem.IsWindows() ? @"D:\models" : "/srv/models";

        Assert.Equal(absolute, Build(absolute).Root);
    }

    [Fact]
    public void Relative_configured_path_resolves_against_the_content_root()
    {
        var root = Path.Combine(Path.GetTempPath(), "typelab-content-root");

        var storage = Build("models", root);

        Assert.Equal(Path.GetFullPath(Path.Combine(root, "models")), storage.Root);
        Assert.True(Path.IsPathRooted(storage.Root));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Blank_configuration_falls_back_to_a_per_user_directory(string? configured)
    {
        var storage = Build(configured);

        Assert.True(Path.IsPathRooted(storage.Root));
        Assert.Contains("models", storage.Root, StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// The files reach gigabytes, so on Windows they must land in Local, never
    /// in Roaming — a roaming profile would try to sync them between machines.
    /// </summary>
    [Fact]
    public void Windows_default_uses_local_appdata_not_roaming()
    {
        if (!OperatingSystem.IsWindows()) return;

        var root = Build(null).Root;

        Assert.Equal(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            Path.GetDirectoryName(Path.GetDirectoryName(root)));
        Assert.DoesNotContain("Roaming", root, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void PathFor_puts_each_model_in_its_own_folder_under_the_root()
    {
        var storage = Build(OperatingSystem.IsWindows() ? @"D:\models" : "/srv/models");

        var path = storage.PathFor("bge-m3");

        Assert.Equal(Path.Combine(storage.Root, "bge-m3"), path);
        Assert.StartsWith(storage.Root, path);
    }

    [Fact]
    public void EnsureWritable_creates_the_directory_and_reports_success()
    {
        var root = Path.Combine(Path.GetTempPath(), "typelab-models-" + Guid.NewGuid().ToString("N"));
        try
        {
            var storage = Build(root);

            Assert.False(storage.Exists);
            Assert.True(storage.EnsureWritable());
            Assert.True(storage.Exists);
            // The probe file must not be left behind.
            Assert.Empty(Directory.GetFiles(root));
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public void UsedBytes_is_zero_when_nothing_is_downloaded_and_counts_nested_files()
    {
        var root = Path.Combine(Path.GetTempPath(), "typelab-models-" + Guid.NewGuid().ToString("N"));
        try
        {
            var storage = Build(root);
            Assert.Equal(0, storage.UsedBytes());

            Directory.CreateDirectory(storage.PathFor("bge-m3"));
            File.WriteAllBytes(Path.Combine(storage.PathFor("bge-m3"), "weights.bin"), new byte[1024]);

            Assert.Equal(1024, storage.UsedBytes());
        }
        finally
        {
            if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
        }
    }
}
