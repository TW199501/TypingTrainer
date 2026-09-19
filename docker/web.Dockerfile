# Build context is the repo root: docker compose -f docker/docker-compose.yml build
FROM node:22-alpine AS build
WORKDIR /repo

# Manifests first so a source-only change does not re-run the install.
COPY package.json package-lock.json ./
COPY apps/package.json apps/package.json
RUN npm ci

COPY apps apps

# Vite reads these at build time and bakes them into the bundle. Pointing at a
# relative /api keeps the browser same-origin, so nginx proxies to the API and
# no CORS negotiation is needed.
ARG VITE_API_BASE_URL=/api
ARG VITE_USE_MOCK=false
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_USE_MOCK=$VITE_USE_MOCK

RUN npm run build

FROM nginx:alpine AS runtime
# Not named default.conf on purpose: the image's
# 10-listen-on-ipv6-by-default.sh entrypoint only runs when that exact file is
# present, and it shells out to `apk manifest nginx` to checksum it — which
# needs the Alpine package index and hangs the container start when the network
# is unavailable. Removing the stock file makes that script exit early; this
# config listens on IPv6 itself.
RUN rm -f /etc/nginx/conf.d/default.conf
COPY docker/nginx.conf /etc/nginx/conf.d/typelab.conf
COPY --from=build /repo/apps/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost/ >/dev/null || exit 1
