-- Rôles PostgreSQL de la plateforme (exécuté une fois, en superutilisateur).
--
-- * Le propriétaire du schéma (ici « postgres » en local) applique les
--   migrations : il crée les tables, les politiques RLS et les droits.
-- * « aussitot_app » est le SEUL rôle utilisé par l'API et le worker à
--   l'exécution. Il n'est ni superutilisateur ni BYPASSRLS : chaque requête
--   est filtrée par les politiques Row-Level Security (isolation stricte des
--   entreprises clientes), même si le code applicatif oubliait un filtre.
--
-- En production, remplacer le mot de passe par un secret fort (gestionnaire
-- de secrets) — jamais celui-ci.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'aussitot_app') THEN
    CREATE ROLE aussitot_app LOGIN PASSWORD 'aussitot_app' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

SELECT 'CREATE DATABASE aussitot_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'aussitot_test')\gexec

GRANT CONNECT ON DATABASE aussitot TO aussitot_app;
GRANT CONNECT ON DATABASE aussitot_test TO aussitot_app;
