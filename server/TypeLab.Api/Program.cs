using ELF.Modules.Hosting.Sidecar;
using ELF.Modules.Hosting.Sidecar.Extensions.DependencyInjection;
using TypeLab.Api.Api;
using TypeLab.Api.Data;
using TypeLab.Api.Models;
using XiHan.Framework.Translation;
using XiHan.Framework.Translation.Google;
using XiHan.Framework.Translation.OpenCC;

var builder = WebApplication.CreateBuilder(args);

// Sidecar mode (ELF_SIDECAR=1): the desktop shell launches this process, binds it
// to 127.0.0.1 on a free port and stops it by closing stdin.
builder.UseElfSidecar();

// The shell tells the API where the models live on this machine.
var modelDir = builder.Configuration["TYPELAB_MODEL_DIR"];
if (!string.IsNullOrWhiteSpace(modelDir))
{
    builder.Configuration["Models:Directory"] = modelDir;
}

builder.Services.AddOpenApi();
builder.Services.AddSqlSugar(builder.Configuration, builder.Environment);
builder.Services.AddSingleton<ModelStorage>();

// Translation: the router plus its providers. OpenCC handles Chinese script
// conversion offline; Google covers the rest and stays dormant until
// Translation__Google__ApiKey is set.
builder.Services.AddXiHanTranslation(builder.Configuration);
builder.Services.AddXiHanOpenCcTranslator();
builder.Services.AddXiHanGoogleTranslator(builder.Configuration);

// The web app is served from Vite in development and from file:// inside the
// Tauri shell, so both origins have to be allowed.
const string WebCors = "web";
builder.Services.AddCors(o => o.AddPolicy(WebCors, p => p
    .WithOrigins(
        builder.Configuration.GetSection("Cors:Origins").Get<string[]>()
            ?? ["http://localhost:5173", "http://tauri.localhost"])
    .AllowAnyHeader()
    .AllowAnyMethod()));

var app = builder.Build();

app.Services.InitDatabase();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// A loopback sidecar has no certificate, so redirecting would break every call.
if (!app.Services.GetRequiredService<ISidecarContext>().IsSidecar)
{
    app.UseHttpsRedirection();
}

app.UseCors(WebCors);

// VITE_API_BASE_URL points at this prefix.
var api = app.MapGroup("/api");

api.MapGet("/health", () => Results.Ok(new { status = "ok", utc = DateTime.UtcNow }))
    .WithName("Health");

// Plumbing routes generated straight from the entities. Endpoints carrying real
// behaviour (auth, session scoring and anti-cheat, stats, coach, error book)
// are still to be written — see docs/api-contract.md.
api.MapCrud<Category>("/categories");
api.MapCrud<PracticeText>("/texts");
api.MapCrud<Word>("/words");

// Hand-written: the storage path is resolved per runtime, and the built-in
// prompt rows must not be deletable through a generic DELETE.
api.MapModels();
api.MapPrompts();
api.MapTranslation();

return await app.RunElfSidecarAsync();
