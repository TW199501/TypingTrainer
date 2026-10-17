namespace TypeLab.Api;

/// <summary>
/// Refuses a write (POST, PUT, PATCH, DELETE) that a browser sent from a page this API does
/// not serve. A multipart form is a CORS "simple" request with no preflight, so CORS alone
/// would let any web page submit one to the loopback sidecar; this answers it with a 403.
/// A request is let through when it has no <c>Origin</c> header (the desktop shell, curl,
/// tests), when its origin is in the CORS allowlist, or when it is same-origin.
/// </summary>
public sealed class OriginGuard(RequestDelegate next, IReadOnlyCollection<string> allowedOrigins)
{
    private readonly HashSet<string> _allowed = allowedOrigins
        .Select(o => o.Trim().TrimEnd('/'))
        .ToHashSet(StringComparer.OrdinalIgnoreCase);

    public async Task InvokeAsync(HttpContext context)
    {
        if (IsAllowed(context.Request))
        {
            await next(context);
            return;
        }

        await Results.Problem(
                statusCode: StatusCodes.Status403Forbidden,
                title: "Requests from this origin are not allowed.")
            .ExecuteAsync(context);
    }

    /// <summary>True when the request may go on to the endpoint.</summary>
    public bool IsAllowed(HttpRequest request)
    {
        if (HttpMethods.IsGet(request.Method) || HttpMethods.IsHead(request.Method)
                                              || HttpMethods.IsOptions(request.Method)
                                              || HttpMethods.IsTrace(request.Method))
        {
            return true;
        }

        var origin = request.Headers.Origin.ToString();
        if (origin.Length == 0)
        {
            return true;
        }

        return _allowed.Contains(origin.TrimEnd('/')) || IsSameOrigin(origin, request.Host);
    }

    /// <summary>
    /// The page was served from this host. A reverse proxy that forwards only the host name
    /// (nginx's <c>$host</c>) drops the port, so the port is compared only when the Host
    /// header carries one; a browser always sends it for a non-default port.
    /// </summary>
    private static bool IsSameOrigin(string origin, HostString host)
    {
        if (!host.HasValue || !Uri.TryCreate(origin, UriKind.Absolute, out var uri)
                           || uri.Scheme is not ("http" or "https"))
        {
            return false;
        }

        if (!string.Equals(uri.Host, host.Host, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return host.Port is not { } port || port == uri.Port;
    }
}
