using SqlSugar;
using TypeLab.Api.Data;
using TypeLab.Api.Models;

namespace TypeLab.Api.Tests;

public class LocalUserSeedsTests
{
    [Fact]
    public void Seed_twice_leaves_one_local_user()
    {
        using var t = new TestDb();
        t.Db.CodeFirst.InitTables(typeof(User));

        var first = LocalUserSeeds.Seed(t.Db);
        var second = LocalUserSeeds.Seed(t.Db);

        Assert.Equal(first, second);
        var only = Assert.Single(t.Db.Queryable<User>().ToList());
        Assert.Equal("local", LocalUserSeeds.Username);
        Assert.Equal(LocalUserSeeds.Username, only.Username);
        Assert.Equal(first, only.Id);
    }
}
