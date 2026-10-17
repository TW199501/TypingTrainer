using ELF.Modules.Hosting.Sidecar;
using ELF.Modules.Hosting.Sidecar.Extensions.DependencyInjection;
using Microsoft.AspNetCore.HostFiltering;
using TypeLab.Api;
using TypeLab.Api.Api;
using TypeLab.Api.Data;
using TypeLab.Api.Models;
using XiHan.Framework.Translation;
using XiHan.Framework.Translation.Google;
using XiHan.Framework.Translation.OpenCC;

// The shell starts the sidecar without a working directory, so it inherits the
// app's (`/` from Finder, $HOME on Linux). The content root, and with it
// appsettings.json, must come from the executable's folder instead.
var signal = new ConfigurationBuilder().AddEnvironmentVariables().AddCommandLine(args).Build();
var sidecarRequested = SidecarSignal.IsRequested(
    Environment.GetEnvironmentVariable(SidecarSignal.EnvironmentVariable), signal);

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = sidecarRequested ? AppContext.BaseDirectory : null,
});

// Sidecar mode (ELF_SIDECAR=1): the desktop shell launches this process, binds it
// to 127.0.0.1 on a free port and stops it by closing stdin.
builder.UseElfSidecar();

// A sidecar answers only to loopback names, so a page whose DNS rebinds to
// 127.0.0.1 is refused. Server mode keeps the configured AllowedHosts.
builder.Services.AddOptions<HostFilteringOptions>()
    .Configure<ISidecarContext>((options, sidecar) =>
    {
        if (sidecar.IsSidecar)
        {
            options.AllowedHosts = ["127.0.0.1", "localhost"];
        }
    });

// The shell tells the API where the models live on this machine.
var modelDir = builder.Configuration["TYPELAB_MODEL_DIR"];
if (!string.IsNullOrWhiteSpace(modelDir))
{
    builder.Configuration["Models:Directory"] = modelDir;
}

builder.Services.AddOpenApi();
builder.Services.AddSqlSugar(builder.Configuration, builder.Environment);
builder.Services.AddSingleton<ModelStorage>();
builder.Services.AddSingleton<LibraryService>();
builder.Services.AddSingleton<DictionaryService>();

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
            ?? ["http://localhost:5173", "http://tauri.localhost", "tauri://localhost"])
    .AllowAnyHeader()
    .AllowAnyMethod()
    .WithExposedHeaders("X-Total-Count")));

var app = builder.Build();

try
{
    app.Services.InitDatabase();
}
catch (Exception ex) when (app.Services.GetRequiredService<ISidecarContext>().IsSidecar)
{
    // The shell waits for the handshake; report the failure on it instead of crashing.
    var reason = ex.Message.Replace("\r", " ").Replace("\n", " ");
    Console.Out.WriteLine($"ELF_SIDECAR_ERROR={reason}");
    Console.Out.Flush();
    return 1;
}

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

// Hand-written: the dictionary rows carry the local user's mastery and import rules.
api.MapWords();

// Hand-written: built-in categories and texts are read-only, and texts are filed
// under a sub-category.
api.MapLibrary();

// Hand-written: the storage path is resolved per runtime, and the built-in
// prompt rows must not be deletable through a generic DELETE.
api.MapModels();
api.MapPrompts();
api.MapTranslation();

return await app.RunElfSidecarAsync();
