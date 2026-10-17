using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace TypeLab.Api.Tests;

/// <summary>Writes from a page outside the CORS allowlist are refused; everything else passes.</summary>
public class OriginGuardTests
{
    private static readonly string[] Allowed = ["http://localhost:5173", "http://tauri.localhost", "tauri://localhost"];

    private static async Task<(bool Reached, HttpContext Context)> Send(
        string method, string? origin, string host = "127.0.0.1:1779", string? contentType = null)
    {
        var context = new DefaultHttpContext
        {
            RequestServices = new ServiceCollection().AddLogging().AddProblemDetails().BuildServiceProvider(),
        };
        context.Request.Method = method;
        context.Request.Host = new HostString(host);
        context.Request.Path = "/api/words/import/file";
        if (origin is not null)
        {
            context.Request.Headers.Origin = origin;
        }

        if (contentType is not null)
        {
            context.Request.ContentType = contentType;
        }

        context.Response.Body = new MemoryStream();
        var reached = false;
        var guard = new OriginGuard(_ =>
        {
            reached = true;
            return Task.CompletedTask;
        }, Allowed);
        await guard.InvokeAsync(context);
        return (reached, context);
    }

    [Theory]
    [InlineData("http://localhost:5173")]
    [InlineData("http://tauri.localhost")]
    [InlineData("TAURI://localhost/")]
    public async Task An_allowed_origin_may_write(string origin)
    {
        var (reached, _) = await Send("POST", origin, contentType: "multipart/form-data; boundary=x");

        Assert.True(reached);
    }

    [Theory]
    [InlineData("POST", "multipart/form-data; boundary=x")]
    [InlineData("DELETE", null)]
    [InlineData("PUT", "application/json")]
    [InlineData("PATCH", "text/plain")]
    public async Task A_foreign_origin_gets_a_403_problem(string method, string? contentType)
    {
        var (reached, context) = await Send(method, "https://evil.example", contentType: contentType);

        Assert.False(reached);
        Assert.Equal(403, context.Response.StatusCode);
        Assert.StartsWith("application/problem+json", context.Response.ContentType);
        context.Response.Body.Position = 0;
        using var body = await JsonDocument.ParseAsync(context.Response.Body);
        Assert.Equal(403, body.RootElement.GetProperty("status").GetInt32());
    }

    [Theory]
    [InlineData("null")]
    [InlineData("http://127.0.0.1:9999")]
    [InlineData("http://localhost:5174")]
    public async Task Look_alike_origins_are_foreign(string origin)
    {
        var (reached, context) = await Send("POST", origin);

        Assert.False(reached);
        Assert.Equal(403, context.Response.StatusCode);
    }

    [Theory]
    [InlineData("GET")]
    [InlineData("HEAD")]
    [InlineData("OPTIONS")]
    public async Task Reads_and_preflights_from_a_foreign_origin_pass(string method)
    {
        var (reached, _) = await Send(method, "https://evil.example");

        Assert.True(reached);
    }

    [Theory]
    [InlineData("POST")]
    [InlineData("DELETE")]
    public async Task A_request_without_an_origin_passes(string method)
    {
        var (reached, _) = await Send(method, null);

        Assert.True(reached);
    }

    [Theory]
    [InlineData("http://127.0.0.1:1779", "127.0.0.1:1779")]
    [InlineData("http://typelab.example:8080", "typelab.example")]
    [InlineData("https://typelab.example", "typelab.example")]
    public async Task A_same_origin_page_may_write(string origin, string host)
    {
        // The second and third are the Docker image: nginx forwards Host without the port.
        var (reached, _) = await Send("POST", origin, host);

        Assert.True(reached);
    }

    [Fact]
    public async Task Same_host_on_another_port_is_foreign()
    {
        var (reached, _) = await Send("POST", "http://127.0.0.1:5555", "127.0.0.1:1779");

        Assert.False(reached);
    }
}
