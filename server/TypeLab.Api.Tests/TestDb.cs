using SqlSugar;
using TypeLab.Api.Models;

namespace TypeLab.Api.Tests;

/// <summary>
/// In-memory SQLite that stays open for the test. SqlSugar's default
/// auto-close would drop an :memory: database between calls.
/// </summary>
internal sealed class TestDb : IDisposable
{
    public ISqlSugarClient Db { get; }

    public TestDb()
    {
        var client = new SqlSugarClient(new ConnectionConfig
        {
            DbType = DbType.Sqlite,
            ConnectionString = "DataSource=:memory:",
            IsAutoCloseConnection = false,
            InitKeyType = InitKeyType.Attribute,
        });
        client.Ado.Open();
        client.CodeFirst.InitTables(
            typeof(PromptTemplate),
            typeof(LocalModelEntry),
            typeof(Translation));
        Db = client;
    }

    public void Dispose() => Db.Dispose();
}
