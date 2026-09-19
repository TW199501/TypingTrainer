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

    public static IServiceCollection AddSqlSugar(this IServiceCollection services, IConfiguration config)
    {
        var connection = config.GetConnectionString("Default")
            ?? "DataSource=app.db";

        // SqlSugarScope is the thread-safe wrapper, so a singleton is correct
        // here — a plain SqlSugarClient is not safe to share across requests.
        services.AddSingleton<ISqlSugarClient>(_ =>
            new SqlSugarScope(
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
                }));

        return services;
    }

    /// <summary>Creates the SQLite file and any missing tables/columns on start.</summary>
    public static void InitDatabase(this IServiceProvider services)
    {
        var db = services.GetRequiredService<ISqlSugarClient>();
        db.DbMaintenance.CreateDatabase();
        db.CodeFirst.InitTables(Entities);
        PromptSeeds.Seed(db);
        ModelSeeds.Seed(db);
        CatalogueTranslationSeeds.Seed(db);
    }
}
