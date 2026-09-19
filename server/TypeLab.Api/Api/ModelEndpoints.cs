using SqlSugar;
using TypeLab.Api.Data;
using TypeLab.Api.Models;

namespace TypeLab.Api.Api;

/// <summary>
/// The Models page asks the server where its files live rather than assuming a
/// path, because the answer is different for a container, a dev machine and a
/// desktop install. Inside the Tauri shell the front end asks the shell instead
/// — same contract, different owner of the disk.
/// </summary>
public static class ModelEndpoints
{
    public record ModelDto(
        string Code,
        string Name,
        string Kind,
        string Note,
        int Mb,
        bool Installed);

    public record ModelStorageDto(
        string Directory,
        bool Writable,
        double UsedMb,
        IReadOnlyList<ModelDto> Models);

    public static RouteGroupBuilder MapModels(this IEndpointRouteBuilder app, string prefix = "/models")
    {
        var group = app.MapGroup(prefix).WithTags("Models");

        group.MapGet("/", async (ISqlSugarClient db, ModelStorage storage) =>
        {
            var rows = await db.Queryable<LocalModelEntry>().OrderBy(m => m.SortOrder).ToListAsync();
            return Results.Ok(new ModelStorageDto(
                storage.Root,
                storage.EnsureWritable(),
                Math.Round(storage.UsedBytes() / 1024d / 1024d, 2),
                rows.Select(m => new ModelDto(m.Code, m.Name, m.Kind, m.Note, m.SizeMb, m.Installed)).ToList()));
        })
        .WithName("GetModels");

        // Marks the catalogue entry installed. Fetching the weights is not
        // implemented yet — SourceUrl is still unset for every model — so this
        // only moves the flag the UI reads.
        group.MapPost("/{code}/install", async (ISqlSugarClient db, string code) =>
        {
            var row = await db.Queryable<LocalModelEntry>().Where(m => m.Code == code).FirstAsync();
            if (row is null) return Results.NotFound();

            row.Installed = true;
            row.InstalledAt = DateTime.UtcNow;
            await db.Updateable(row).ExecuteCommandAsync();
            return Results.NoContent();
        });

        group.MapDelete("/{code}/install", async (ISqlSugarClient db, ModelStorage storage, string code) =>
        {
            var row = await db.Queryable<LocalModelEntry>().Where(m => m.Code == code).FirstAsync();
            if (row is null) return Results.NotFound();

            var dir = storage.PathFor(row.Code);
            if (Directory.Exists(dir)) Directory.Delete(dir, recursive: true);

            row.Installed = false;
            row.InstalledAt = null;
            await db.Updateable(row).ExecuteCommandAsync();
            return Results.NoContent();
        });

        return group;
    }
}
