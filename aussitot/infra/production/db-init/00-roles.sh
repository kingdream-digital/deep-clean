#!/bin/sh
# Rôle d'exécution de l'API (soumis aux politiques RLS), mot de passe fourni par l'environnement.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v app_password="$APP_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE aussitot_app LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE', :'app_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'aussitot_app')\gexec
GRANT CONNECT ON DATABASE aussitot TO aussitot_app;
SQL
