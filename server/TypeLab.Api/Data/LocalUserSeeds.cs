using SqlSugar;
using TypeLab.Api.Models;

namespace TypeLab.Api.Data;

/// <summary>
/// The single account of a standalone install. With no login there is still a
/// user to own sessions and stats, so one row is created on first start.
/// </summary>
public static class LocalUserSeeds
{
    public const string Username = "local";

    /// <summary>Returns the local user's Id, inserting the row if it is missing.</summary>
    public static int Seed(ISqlSugarClient db)
    {
        var existing = db.Queryable<User>().First(u => u.Username == Username);
        if (existing is not null)
        {
            return existing.Id;
        }

        try
        {
            return db.Insertable(new User { Username = Username }).ExecuteReturnIdentity();
        }
        catch (Exception)
        {
            // Another process may have inserted the row between the query and the
            // insert (the username has a unique index); use theirs if it is there.
            var raced = db.Queryable<User>().First(u => u.Username == Username);
            if (raced is null)
            {
                throw;
            }

            return raced.Id;
        }
    }
}
