using Microsoft.Data.Sqlite;
using SqlSugar;
using TypeLab.Api.Models;

namespace TypeLab.Api.Data;

public static class SqlSugarSetup
{
    /// <summary>
    /// Every entity CodeFirst manages. Adding a type here is all it takes for
    /// its table to be created on the next start — and, paired with
    /// <see cref="Api.CrudEndpoints"/>, for it to get a REST surface too.
    /// </summary>
    public static readonly Type[] Entities =
    [
        typeof(User),
        typeof(Category),
        typeof(Translation),
        typeof(PracticeText),
        typeof(TextSegmentation),
        typeof(TextSegment),
        typeof(Session),
        typeof(SessionKeystroke),
        typeof(KeyError),
        typeof(ErrorBookEntry),
        typeof(Word),
        typeof(WordExample),
        typeof(UserWordMastery),
        typeof(PromptTemplate),
        typeof(LocalModelEntry),
        typeof(Achievement),
        typeof(UserAchievement),
    ];

    public static IServiceCollection AddSqlSugar(this IServiceCollection services, IConfiguration config, IHostEnvironment env)
    {
        var connection = ResolveConnectionString(config, env.ContentRootPath);
        // SqlSugarScope is the thread-safe wrapper, so a singleton is correct
        // here — a plain SqlSugarClient is not safe to share across requests.
        services.AddSingleton<ISqlSugarClient>(_ =>
        {
            // Created on first use, not at registration, so a failure surfaces in
            // InitDatabase where the sidecar can report it.
            EnsureDirectory(connection);
            return new SqlSugarScope(
                new ConnectionConfig
                {
                    DbType = DbType.Sqlite,
                    ConnectionString = connection,
                    IsAutoCloseConnection = true,
                    InitKeyType = InitKeyType.Attribute,
                },
                db =>
                {
                    // Uncomment while debugging to see the generated SQL.
                    // db.Aop.OnLogExecuting = (sql, _) => Console.WriteLine(sql);
                });
        });

        return services;
    }

    /// <summary>
    /// Works out the SQLite connection string. <c>TYPELAB_DB_PATH</c> (set by the
    /// desktop shell) wins; otherwise <c>ConnectionStrings:Default</c> is used,
    /// with a relative data source anchored at the content root so the database
    /// does not depend on the working directory.
    /// </summary>
    public static string ResolveConnectionString(IConfiguration config, string contentRoot)
    {
        var dbPath = config["TYPELAB_DB_PATH"];
        if (!string.IsNullOrWhiteSpace(dbPath))
        {
            return $"DataSource={dbPath}";
        }

        var configured = config.GetConnectionString("Default") ?? "DataSource=app.db";
        var dataSource = new SqliteConnectionStringBuilder(configured).DataSource;
        if (string.IsNullOrEmpty(dataSource) || dataSource == ":memory:")
        {
            return configured;
        }

        return $"DataSource={Path.GetFullPath(dataSource, contentRoot)}";
    }

    private static void EnsureDirectory(string connection)
    {
        var dataSource = new SqliteConnectionStringBuilder(connection).DataSource;
        var directory = string.IsNullOrEmpty(dataSource) || dataSource == ":memory:"
            ? null
            : Path.GetDirectoryName(Path.GetFullPath(dataSource));
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }
    }

    /// <summary>
    /// Creates the SQLite file and any missing tables/columns on start. Several
    /// processes may share one database file, so the whole step runs under a
    /// machine-wide mutex keyed by that file; the seeds are check-then-insert and
    /// would otherwise collide on their unique indexes.
    /// </summary>
    public static void InitDatabase(this IServiceProvider services)
    {
        var db = services.GetRequiredService<ISqlSugarClient>();

        using var gate = new Mutex(false, GateName(db.CurrentConnectionConfig.ConnectionString));
        try
        {
            gate.WaitOne();
        }
        catch (AbandonedMutexException)
        {
            // A previous holder died mid-init; every step below is idempotent.
        }

        try
        {
            db.DbMaintenance.CreateDatabase();
            db.CodeFirst.InitTables(Entities);
            LocalUserSeeds.Seed(db);
            PromptSeeds.Seed(db);
            ModelSeeds.Seed(db);
            CatalogueTranslationSeeds.Seed(db);
        }
        finally
        {
            gate.ReleaseMutex();
        }
    }

    private static string GateName(string connection)
    {
        var dataSource = new SqliteConnectionStringBuilder(connection).DataSource;
        var key = Path.GetFullPath(dataSource).ToLowerInvariant();
        return "TypeLab.Db." + Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(key)));
    }
}
