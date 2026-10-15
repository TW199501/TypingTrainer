using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Configuration;
using TypeLab.Api.Data;

namespace TypeLab.Api.Tests;

public class SqlSugarSetupTests
{
    private static IConfiguration Config(params (string Key, string Value)[] pairs) =>
        new ConfigurationBuilder()
            .AddInMemoryCollection(pairs.ToDictionary(p => p.Key, p => (string?)p.Value))
            .Build();

    private static string DataSourceOf(string connection) =>
        new SqliteConnectionStringBuilder(connection).DataSource;

    private static string Tmp() => Path.Combine(Path.GetTempPath(), "typelab-" + Guid.NewGuid().ToString("N"));

    [Fact]
    public void Db_path_env_wins_over_connection_string()
    {
        var tmp = Tmp();
        var path = Path.Combine(tmp, "x.db");
        var config = Config(("TYPELAB_DB_PATH", path), ("ConnectionStrings:Default", "DataSource=app.db"));

        Assert.Equal(path, DataSourceOf(SqlSugarSetup.ResolveConnectionString(config, tmp)));
    }

    [Fact]
    public void Relative_data_source_resolves_against_content_root()
    {
        var root = Tmp();
        var config = Config(("ConnectionStrings:Default", "DataSource=app.db"));

        var result = SqlSugarSetup.ResolveConnectionString(config, root);

        Assert.Equal(Path.GetFullPath(Path.Combine(root, "app.db")), DataSourceOf(result));
    }

    [Fact]
    public void Absolute_data_source_is_kept()
    {
        var abs = Path.Combine(Tmp(), "abs.db");
        var config = Config(("ConnectionStrings:Default", $"DataSource={abs}"));

        var result = SqlSugarSetup.ResolveConnectionString(config, Tmp());

        Assert.Equal(abs, DataSourceOf(result));
    }

    [Fact]
    public void Db_path_with_spaces_and_cjk_is_kept_verbatim()
    {
        var tmp = Tmp();
        var path = Path.Combine(tmp, "空 白", "typelab.db");
        var config = Config(("TYPELAB_DB_PATH", path));

        var result = SqlSugarSetup.ResolveConnectionString(config, tmp);

        Assert.Equal(path, DataSourceOf(result));
    }

    [Fact]
    public void Db_path_with_semicolon_and_equals_is_kept_verbatim()
    {
        var tmp = Tmp();
        var path = Path.Combine(tmp, "a;Mode=Memory", "typelab.db");
        var config = Config(("TYPELAB_DB_PATH", path));

        var result = SqlSugarSetup.ResolveConnectionString(config, tmp);

        Assert.Equal(path, DataSourceOf(result));
    }

    [Fact]
    public void Content_root_with_semicolon_is_kept_verbatim()
    {
        var root = Path.Combine(Tmp(), "x;y=z");
        var config = Config(("ConnectionStrings:Default", "DataSource=app.db"));

        var result = SqlSugarSetup.ResolveConnectionString(config, root);

        Assert.Equal(Path.GetFullPath(Path.Combine(root, "app.db")), DataSourceOf(result));
    }
}
