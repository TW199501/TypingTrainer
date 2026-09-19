# Build context is the repo root: docker compose -f docker/docker-compose.yml build
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Every referenced project's manifest must be present for restore to resolve
# the ProjectReferences; copying only the manifests keeps this layer cached
# until a dependency actually changes.
COPY server/TypeLab.Api/TypeLab.Api.csproj TypeLab.Api/
COPY server/framework/XiHan.Framework.Translation.Abstractions/*.csproj framework/XiHan.Framework.Translation.Abstractions/
COPY server/framework/XiHan.Framework.Translation/*.csproj framework/XiHan.Framework.Translation/
COPY server/framework/XiHan.Framework.Translation.Google/*.csproj framework/XiHan.Framework.Translation.Google/
COPY server/framework/XiHan.Framework.Translation.OpenCC/*.csproj framework/XiHan.Framework.Translation.OpenCC/
RUN dotnet restore TypeLab.Api/TypeLab.Api.csproj

COPY server/ ./
RUN dotnet publish TypeLab.Api/TypeLab.Api.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app ./

# The SQLite file lives on a volume so it survives a container rebuild.
# $APP_UID is the non-root user the aspnet image runs as.
USER root
RUN mkdir -p /data && chown -R $APP_UID /data
USER $APP_UID
VOLUME /data

ENV ASPNETCORE_HTTP_PORTS=8080 \
    ConnectionStrings__Default="DataSource=/data/app.db"
EXPOSE 8080
ENTRYPOINT ["dotnet", "TypeLab.Api.dll"]
