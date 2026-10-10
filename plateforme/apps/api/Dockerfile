# syntax=docker/dockerfile:1.7
#
# Image de l'API Aussitôt — une seule image pour les deux processus :
#   API HTTP : node dist/server.js   (commande par défaut)
#   worker   : node dist/worker.js   (emails, notifications push, maintenance)
# Migrations : cible « migrate » (prisma migrate deploy, rôle propriétaire).
#
# Construction (depuis le dossier plateforme/) :
#   docker build -f apps/api/Dockerfile -t aussitot-api .
#   docker build -f apps/api/Dockerfile --target migrate -t aussitot-migrate .
# Réseau d'entreprise avec inspection TLS : ajoutez
#   --secret id=extra_ca,src=/chemin/vers/ca.pem

FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false NPM_CONFIG_AUDIT=false

# Manifestes seuls : la couche des dépendances n'est reconstruite que si elles changent.
FROM base AS manifests
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/app/package.json apps/app/

FROM manifests AS deps
RUN --mount=type=secret,id=extra_ca,required=false --mount=type=cache,target=/root/.npm \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    npm ci -w @aussitot/api -w @aussitot/shared --include-workspace-root

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
# « generate » ne se connecte pas à la base : une adresse fictive suffit à charger la configuration.
RUN cd apps/api && DATABASE_ADMIN_URL=postgresql://build:build@localhost:5432/build npx prisma generate && npx tsup

# Migrations de la base (à lancer avant chaque déploiement, avec DATABASE_ADMIN_URL).
FROM build AS migrate
WORKDIR /app/apps/api
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

FROM manifests AS prod-deps
RUN --mount=type=secret,id=extra_ca,required=false --mount=type=cache,target=/root/.npm \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    npm ci -w @aussitot/api --omit=dev \
    # Outils tirés par les dépendances « peer » de @prisma/client (CLI, studio, TypeScript) :
    # inutiles à l'exécution, le client Prisma généré étant intégré au build.
    && rm -rf node_modules/prisma node_modules/@prisma/dev node_modules/@prisma/studio-core node_modules/@prisma/engines \
       node_modules/@prisma/fetch-engine node_modules/typescript node_modules/effect node_modules/@electric-sql \
       node_modules/lightningcss node_modules/lightningcss-*

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
WORKDIR /app/apps/api
# Dossier des fichiers en stockage local (en production, préférez S3 : STORAGE_DRIVER=s3).
RUN mkdir -p storage && chown node:node storage
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/server.js"]
