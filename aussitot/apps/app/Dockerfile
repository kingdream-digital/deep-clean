# syntax=docker/dockerfile:1.7
#
# Application web d'Aussitôt : export statique d'Expo, servi par Caddy.
# L'adresse de l'API est intégrée au moment de la construction :
#   docker build -f apps/app/Dockerfile --build-arg EXPO_PUBLIC_API_URL=https://api.exemple.fr -t aussitot-web .
# (depuis le dossier aussitot/ ; contexte filtré par apps/app/Dockerfile.dockerignore)
# Réseau d'entreprise avec inspection TLS : ajoutez --secret id=extra_ca,src=/chemin/vers/ca.pem

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false EXPO_NO_TELEMETRY=1 CI=1
# Manifestes seuls : la couche des dépendances n'est reconstruite que si elles changent.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/app/package.json apps/app/
RUN --mount=type=secret,id=extra_ca,required=false --mount=type=cache,target=/root/.npm \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    npm ci -w @aussitot/app -w @aussitot/shared --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/app apps/app
ARG EXPO_PUBLIC_API_URL
RUN test -n "$EXPO_PUBLIC_API_URL" || { echo "EXPO_PUBLIC_API_URL (adresse publique de l'API) est requis."; exit 1; }
RUN cd apps/app && npx expo export --platform web --output-dir dist

FROM caddy:2-alpine
COPY apps/app/web.Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/app/dist /srv
EXPOSE 80
