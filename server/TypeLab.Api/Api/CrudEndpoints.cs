using SqlSugar;

namespace TypeLab.Api.Api;

/// <summary>
/// Generic REST surface over a SqlSugar entity, so a new table does not need a
/// hand-written controller to become callable:
/// <code>app.MapCrud&lt;Word&gt;("/words");</code>
/// gives list (paged), get-by-id, create, update and delete.
///
/// These are the plumbing routes. Endpoints with real behaviour — scoring,
/// anti-cheat re-verification, the spaced-repetition scheduler — stay
/// hand-written; see docs/api-contract.md.
/// </summary>
public static class CrudEndpoints
{
    public static RouteGroupBuilder MapCrud<T>(this IEndpointRouteBuilder app, string prefix)
        where T : class, new()
    {
        var group = app.MapGroup(prefix).WithTags(typeof(T).Name);

        group.MapGet("/", async (ISqlSugarClient db, int page = 1, int size = 50) =>
        {
            var total = new RefAsync<int>(0);
            var rows = await db.Queryable<T>()
                .ToPageListAsync(Math.Max(page, 1), Math.Clamp(size, 1, 500), total);
            return Results.Ok(new { total = total.Value, page, size, rows });
        });

        group.MapGet("/{id:int}", async (ISqlSugarClient db, int id) =>
        {
            var row = await db.Queryable<T>().In(id).FirstAsync();
            return row is null ? Results.NotFound() : Results.Ok(row);
        });

        group.MapPost("/", async (ISqlSugarClient db, T body) =>
        {
            var id = await db.Insertable(body).ExecuteReturnIdentityAsync();
            return Results.Created($"{prefix}/{id}", new { id });
        });

        group.MapPut("/{id:int}", async (ISqlSugarClient db, int id, T body) =>
        {
            var affected = await db.Updateable(body).ExecuteCommandAsync();
            return affected > 0 ? Results.NoContent() : Results.NotFound();
        });

        group.MapDelete("/{id:int}", async (ISqlSugarClient db, int id) =>
        {
            var affected = await db.Deleteable<T>().In(id).ExecuteCommandAsync();
            return affected > 0 ? Results.NoContent() : Results.NotFound();
        });

        return group;
    }
}
