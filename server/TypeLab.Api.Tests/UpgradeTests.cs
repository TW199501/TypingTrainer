using Microsoft.Data.Sqlite;
using SqlSugar;
using TypeLab.Api.Data;
using TypeLab.Api.Models;

namespace TypeLab.Api.Tests;

public class UpgradeTests
{
    [Fact]
    public void InitDatabase_upgrades_tables_created_before_the_codes()
    {
        var path = Path.Combine(Path.GetTempPath(), $"typelab-upgrade-{Guid.NewGuid():N}.db");
        try
        {
            var cs = new SqliteConnectionStringBuilder { DataSource = path, Pooling = false }.ToString();
            using (var raw = new SqliteConnection(cs))
            {
                raw.Open();
                using var cmd = raw.CreateCommand();
                cmd.CommandText = """
                    CREATE TABLE "Categories"(
                    "Id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
                    "ParentId" integer NULL  ,
                    "Name" varchar(128) NOT NULL  ,
                    "I18nKey" varchar(64) NULL  ,
                    "Color" varchar(32) NULL  ,
                    "Layout" varchar(32) NULL  ,
                    "Kind" varchar(32) NOT NULL  ,
                    "SortOrder" integer NOT NULL    );
                    CREATE TABLE "Texts"(
                    "Id" integer NOT NULL PRIMARY KEY AUTOINCREMENT,
                    "CategoryId" integer NOT NULL  ,
                    "Title" varchar(256) NOT NULL  ,
                    "Content" text NOT NULL  ,
                    "Level" integer NOT NULL  ,
                    "Chars" integer NOT NULL  ,
                    "Language" varchar(16) NOT NULL  ,
                    "CreatedBy" integer NULL  ,
                    "CreatedAt" datetime NOT NULL    );
                    INSERT INTO "Categories"("Name","Kind","SortOrder") VALUES ('Mine','custom',3);
                    INSERT INTO "Texts"("CategoryId","Title","Content","Level","Chars","Language","CreatedAt")
                      VALUES (1,'old','old text',1,8,'en','2026-01-01 00:00:00');
                    """;
                cmd.ExecuteNonQuery();
            }

            using var db = new SqlSugarClient(new ConnectionConfig
            {
                DbType = DbType.Sqlite,
                ConnectionString = cs,
                IsAutoCloseConnection = true,
                InitKeyType = InitKeyType.Attribute,
            });

            db.CodeFirst.InitTables(SqlSugarSetup.Entities);
            LocalUserSeeds.Seed(db);
            CategorySeeds.Seed(db);
            TextSeeds.Seed(db);
            // A second start must be a no-op.
            db.CodeFirst.InitTables(SqlSugarSetup.Entities);
            CategorySeeds.Seed(db);
            TextSeeds.Seed(db);

            var cats = db.Queryable<Category>().ToList();
            Assert.Equal(42, cats.Count);
            Assert.Equal(41, cats.Count(c => c.Code != null));
            var mine = Assert.Single(cats, c => c.Name == "Mine");
            Assert.Null(mine.Code);
            Assert.Equal(3, mine.SortOrder);

            var texts = db.Queryable<PracticeText>().ToList();
            Assert.Equal(16, texts.Count);
            var old = Assert.Single(texts, t => t.Title == "old");
            Assert.Null(old.Code);
            Assert.Equal(0, old.SortOrder);
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            File.Delete(path);
        }
    }
}
