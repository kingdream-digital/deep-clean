-- =============================================================================
-- Aussitôt — migration initiale
-- =============================================================================
-- Fonctions d'isolation multi-entreprises (utilisées par les valeurs par défaut
-- et les politiques Row-Level Security plus bas).

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Entreprise de la transaction courante, positionnée par l'API
-- (SELECT set_config('app.org_id', '<uuid>', true)) au début de chaque requête.
CREATE OR REPLACE FUNCTION app_current_org() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT NULLIF(current_setting('app.org_id', true), '')::uuid
$$;

-- unaccent() n'est pas IMMUTABLE : enveloppe figée pour les index de recherche
-- floue (« peguy » trouve « Péguy »).
CREATE OR REPLACE FUNCTION app_unaccent(text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
  SELECT public.unaccent('public.unaccent'::regdictionary, $1)
$$;

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'DIRECTOR', 'HR', 'SUPERVISOR', 'TEAM_LEAD', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('STARTER', 'PRO', 'BUSINESS');

-- CreateEnum
CREATE TYPE "VatRegime" AS ENUM ('NORMAL', 'FRANCHISE');

-- CreateEnum
CREATE TYPE "ClientKind" AS ENUM ('COMPANY', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "Unit" AS ENUM ('HOUR', 'DAY', 'UNIT', 'SQM', 'FLAT', 'MONTH', 'VISIT', 'KM');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('INVOICE', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('TRANSFER', 'CARD', 'CHECK', 'CASH', 'DIRECT_DEBIT', 'OTHER');

-- CreateEnum
CREATE TYPE "MissionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'DONE', 'VALIDATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "AssistantRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "PendingActionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED', 'FAILED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "OrgStatus" NOT NULL DEFAULT 'ACTIVE',
    "plan" "Plan" NOT NULL DEFAULT 'PRO',
    "seatLimit" INTEGER NOT NULL DEFAULT 25,
    "assistantMonthlyQuota" INTEGER NOT NULL DEFAULT 3000,
    "legalName" TEXT,
    "legalForm" TEXT,
    "shareCapital" TEXT,
    "siren" TEXT,
    "siret" TEXT,
    "vatNumber" TEXT,
    "rcs" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'FR',
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "iban" TEXT,
    "bic" TEXT,
    "vatRegime" "VatRegime" NOT NULL DEFAULT 'NORMAL',
    "defaultVatRateBps" INTEGER NOT NULL DEFAULT 2000,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 30,
    "quoteValidityDays" INTEGER NOT NULL DEFAULT 30,
    "latePenaltyText" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "quotePrefix" TEXT NOT NULL DEFAULT 'D',
    "invoicePrefix" TEXT NOT NULL DEFAULT 'F',
    "creditNotePrefix" TEXT NOT NULL DEFAULT 'AV',
    "brandColor" TEXT,
    "emailSignature" TEXT,
    "logoKey" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL DEFAULT app_current_org(),
    "username" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "jobTitle" TEXT,
    "weeklyHours" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "lastLoginAt" TIMESTAMPTZ(3),
    "passwordChangedAt" TIMESTAMPTZ(3),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "family" UUID NOT NULL,
    "replacedById" UUID,
    "rememberMe" BOOLEAN NOT NULL DEFAULT false,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "lastUsedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL DEFAULT app_current_org(),
    "kind" "ClientKind" NOT NULL DEFAULT 'COMPANY',
    "name" TEXT NOT NULL,
    "contactFirstName" TEXT,
    "contactLastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "country" TEXT NOT NULL DEFAULT 'FR',
    "siren" TEXT,
    "siret" TEXT,
    "vatNumber" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL DEFAULT app_current_org(),
    "clientId" UUID,
    "name" TEXT NOT NULL,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "accessNotes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_items" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL DEFAULT app_current_org(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" "Unit" NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "vatRateBps" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL DEFAULT app_current_org(),
    "number" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "clientId" UUID NOT NULL,
    "siteId" UUID,
    "title" TEXT,
    "issueDate" DATE NOT NULL,
    "validUntil" DATE,
    "notes" TEXT,
    "internalNotes" TEXT,
    "vatExempt" BOOLEAN NOT NULL DEFAULT false,
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "vatCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "vatBreakdown" JSONB NOT NULL DEFAULT '[]',
    "clientSnapshot" JSONB,
    "sellerSnapshot" JSONB,
    "sentAt" TIMESTAMPTZ(3),
    "acceptedAt" TIMESTAMPTZ(3),
    "declinedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_lines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL DEFAULT app_current_org(),
    "quoteId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" "Unit" NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "vatRateBps" INTEGER NOT NULL,
    "discountBps" INTEGER NOT NULL DEFAULT 0,
    "totalHtCents" INTEGER NOT NULL,
    "catalogItemId" UUID,

    CONSTRAINT "quote_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL DEFAULT app_current_org(),
    "kind" "InvoiceKind" NOT NULL DEFAULT 'INVOICE',
    "number" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "clientId" UUID NOT NULL,
    "siteId" UUID,
    "quoteId" UUID,
    "creditedInvoiceId" UUID,
    "title" TEXT,
    "issueDate" DATE,
    "dueDate" DATE,
    "servicePeriod" TEXT,
    "notes" TEXT,
    "internalNotes" TEXT,
    "vatExempt" BOOLEAN NOT NULL DEFAULT false,
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "vatCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "vatBreakdown" JSONB NOT NULL DEFAULT '[]',
    "amountPaidCents" INTEGER NOT NULL DEFAULT 0,
    "clientSnapshot" JSONB,
    "sellerSnapshot" JSONB,
    "issuedAt" TIMESTAMPTZ(3),
    "sentAt" TIMESTAMPTZ(3),
    "paidAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL DEFAULT app_current_org(),
    "invoiceId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit" "Unit" NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "vatRateBps" INTEGER NOT NULL,
    "discountBps" INTEGER NOT NULL DEFAULT 0,
    "totalHtCents" INTEGER NOT NULL,
    "catalogItemId" UUID,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL DEFAULT app_current_org(),
    "invoiceId" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidOn" DATE NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "recordedById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_sequences" (
    "organization_id" UUID NOT NULL DEFAULT app_current_org(),
    "key" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "number_sequences_pkey" PRIMARY KEY ("organization_id","key")
);

-- CreateTable
CREATE TABLE "missions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL DEFAULT app_current_org(),
    "title" TEXT NOT NULL,
    "status" "MissionStatus" NOT NULL DEFAULT 'PLANNED',
    "siteId" UUID,
    "clientId" UUID,
    "date" DATE NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "teamLeadId" UUID,
    "instructions" TEXT,
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),
    "validatedAt" TIMESTAMPTZ(3),
    "validatedById" UUID,
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "missions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mission_assignments" (
    "organization_id" UUID NOT NULL DEFAULT app_current_org(),
    "missionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mission_assignments_pkey" PRIMARY KEY ("missionId","userId")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL DEFAULT app_current_org(),
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_tokens" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL DEFAULT app_current_org(),
    "userId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL DEFAULT app_current_org(),
    "userId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" UUID,
    "metadata" JSONB,
    "viaAssistant" BOOLEAN NOT NULL DEFAULT false,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_outbox" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL DEFAULT app_current_org(),
    "kind" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "to" TEXT NOT NULL,
    "replyTo" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_conversations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL DEFAULT app_current_org(),
    "userId" UUID NOT NULL,
    "title" TEXT,
    "roleAtStart" "Role" NOT NULL,
    "pendingToolResults" JSONB,
    "lastActivityAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assistant_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_messages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL DEFAULT app_current_org(),
    "conversationId" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "role" "AssistantRole" NOT NULL,
    "content" JSONB NOT NULL,
    "displayText" TEXT,
    "inputMode" TEXT,
    "uiEvents" JSONB,
    "model" TEXT,
    "stopReason" TEXT,
    "usage" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistant_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_actions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL DEFAULT app_current_org(),
    "conversationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "toolUseId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "title" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "confirmLabel" TEXT NOT NULL,
    "status" "PendingActionStatus" NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),

    CONSTRAINT "assistant_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_months" (
    "organization_id" UUID NOT NULL DEFAULT app_current_org(),
    "month" TEXT NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" BIGINT NOT NULL DEFAULT 0,
    "outputTokens" BIGINT NOT NULL DEFAULT 0,
    "cacheReadTokens" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "ai_usage_months_pkey" PRIMARY KEY ("organization_id","month")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "users_organization_id_role_idx" ON "users"("organization_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "users_organization_id_username_key" ON "users"("organization_id", "username");

-- CreateIndex
CREATE UNIQUE INDEX "users_organization_id_email_key" ON "users"("organization_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refreshTokenHash_key" ON "sessions"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_family_idx" ON "sessions"("family");

-- CreateIndex
CREATE INDEX "clients_organization_id_name_idx" ON "clients"("organization_id", "name");

-- CreateIndex
CREATE INDEX "sites_organization_id_name_idx" ON "sites"("organization_id", "name");

-- CreateIndex
CREATE INDEX "catalog_items_organization_id_name_idx" ON "catalog_items"("organization_id", "name");

-- CreateIndex
CREATE INDEX "quotes_organization_id_status_issueDate_idx" ON "quotes"("organization_id", "status", "issueDate");

-- CreateIndex
CREATE INDEX "quotes_organization_id_clientId_idx" ON "quotes"("organization_id", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_organization_id_number_key" ON "quotes"("organization_id", "number");

-- CreateIndex
CREATE INDEX "quote_lines_quoteId_position_idx" ON "quote_lines"("quoteId", "position");

-- CreateIndex
CREATE INDEX "invoices_organization_id_status_dueDate_idx" ON "invoices"("organization_id", "status", "dueDate");

-- CreateIndex
CREATE INDEX "invoices_organization_id_clientId_idx" ON "invoices"("organization_id", "clientId");

-- CreateIndex
CREATE INDEX "invoices_organization_id_issueDate_idx" ON "invoices"("organization_id", "issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_organization_id_number_key" ON "invoices"("organization_id", "number");

-- CreateIndex
CREATE INDEX "invoice_lines_invoiceId_position_idx" ON "invoice_lines"("invoiceId", "position");

-- CreateIndex
CREATE INDEX "payments_invoiceId_idx" ON "payments"("invoiceId");

-- CreateIndex
CREATE INDEX "payments_organization_id_paidOn_idx" ON "payments"("organization_id", "paidOn");

-- CreateIndex
CREATE INDEX "missions_organization_id_date_idx" ON "missions"("organization_id", "date");

-- CreateIndex
CREATE INDEX "missions_organization_id_status_date_idx" ON "missions"("organization_id", "status", "date");

-- CreateIndex
CREATE INDEX "missions_siteId_idx" ON "missions"("siteId");

-- CreateIndex
CREATE INDEX "mission_assignments_organization_id_userId_idx" ON "mission_assignments"("organization_id", "userId");

-- CreateIndex
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "push_tokens_token_key" ON "push_tokens"("token");

-- CreateIndex
CREATE INDEX "push_tokens_userId_idx" ON "push_tokens"("userId");

-- CreateIndex
CREATE INDEX "activity_logs_organization_id_createdAt_idx" ON "activity_logs"("organization_id", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "activity_logs_organization_id_entityType_entityId_idx" ON "activity_logs"("organization_id", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "email_outbox_organization_id_entityType_entityId_idx" ON "email_outbox"("organization_id", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "email_outbox_status_createdAt_idx" ON "email_outbox"("status", "createdAt");

-- CreateIndex
CREATE INDEX "assistant_conversations_userId_lastActivityAt_idx" ON "assistant_conversations"("userId", "lastActivityAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "assistant_messages_conversationId_seq_key" ON "assistant_messages"("conversationId", "seq");

-- CreateIndex
CREATE INDEX "assistant_actions_conversationId_status_idx" ON "assistant_actions"("conversationId", "status");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_lines" ADD CONSTRAINT "quote_lines_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "catalog_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_creditedInvoiceId_fkey" FOREIGN KEY ("creditedInvoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "catalog_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "number_sequences" ADD CONSTRAINT "number_sequences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missions" ADD CONSTRAINT "missions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missions" ADD CONSTRAINT "missions_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missions" ADD CONSTRAINT "missions_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missions" ADD CONSTRAINT "missions_teamLeadId_fkey" FOREIGN KEY ("teamLeadId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missions" ADD CONSTRAINT "missions_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missions" ADD CONSTRAINT "missions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission_assignments" ADD CONSTRAINT "mission_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission_assignments" ADD CONSTRAINT "mission_assignments_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission_assignments" ADD CONSTRAINT "mission_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "assistant_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_actions" ADD CONSTRAINT "assistant_actions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_actions" ADD CONSTRAINT "assistant_actions_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "assistant_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_actions" ADD CONSTRAINT "assistant_actions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_months" ADD CONSTRAINT "ai_usage_months_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- =============================================================================
-- Recherche floue (assistant vocal : « devis pour la boulangerie Dupond »)
-- =============================================================================

CREATE INDEX "clients_name_trgm_idx" ON "clients" USING gin (app_unaccent(lower("name")) gin_trgm_ops);
CREATE INDEX "sites_name_trgm_idx" ON "sites" USING gin (app_unaccent(lower("name")) gin_trgm_ops);
CREATE INDEX "catalog_items_name_trgm_idx" ON "catalog_items" USING gin (app_unaccent(lower("name")) gin_trgm_ops);
CREATE INDEX "users_name_trgm_idx" ON "users" USING gin (app_unaccent(lower("firstName" || ' ' || "lastName")) gin_trgm_ops);

-- =============================================================================
-- Row-Level Security : isolation stricte des entreprises
-- =============================================================================
-- Chaque table porte organization_id. Une ligne n'est visible (et ne peut
-- être créée ou modifiée) que si elle appartient à l'entreprise de la
-- transaction courante. FORCE : la règle s'applique même au propriétaire des
-- tables (seul un superutilisateur y échappe — l'API ne l'est jamais).

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'sessions', 'clients', 'sites', 'catalog_items',
    'quotes', 'quote_lines', 'invoices', 'invoice_lines', 'payments', 'number_sequences',
    'missions', 'mission_assignments', 'notifications', 'push_tokens',
    'activity_logs', 'email_outbox',
    'assistant_conversations', 'assistant_messages', 'assistant_actions', 'ai_usage_months'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org())',
      t
    );
  END LOOP;
END
$$;

-- La table des entreprises elle-même : une entreprise ne voit que sa propre ligne.
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "organizations"
  USING ("id" = app_current_org())
  WITH CHECK ("id" = app_current_org());

-- =============================================================================
-- Accès transverses STRICTEMENT limités (fonctions SECURITY DEFINER)
-- =============================================================================
-- Le rôle de l'API n'a aucun moyen de contourner les politiques ci-dessus.
-- Les quelques besoins qui précèdent la connaissance de l'entreprise passent
-- par ces fonctions, qui ne renvoient que le minimum nécessaire.

-- Connexion : retrouver l'entreprise à partir du code saisi.
CREATE OR REPLACE FUNCTION app_org_by_slug(p_slug text)
RETURNS TABLE (id uuid, status "OrgStatus")
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o."id", o."status" FROM "organizations" o WHERE o."slug" = lower(p_slug)
$$;

-- Renouvellement de session : retrouver l'entreprise d'un jeton (empreinte SHA-256).
CREATE OR REPLACE FUNCTION app_session_org(p_refresh_token_hash text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s."organization_id" FROM "sessions" s WHERE s."refreshTokenHash" = p_refresh_token_hash
$$;

-- Tâches planifiées : liste des entreprises actives (traitées ensuite une par une, en mode isolé).
CREATE OR REPLACE FUNCTION app_active_org_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o."id" FROM "organizations" o WHERE o."status" = 'ACTIVE'
$$;

-- Reprise des emails restés en file (redémarrage du serveur entre l'écriture et l'envoi).
CREATE OR REPLACE FUNCTION app_stale_queued_emails(p_before timestamptz, p_limit integer)
RETURNS TABLE (id uuid, organization_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e."id", e."organization_id" FROM "email_outbox" e
  WHERE e."status" = 'QUEUED' AND e."updatedAt" < p_before
  ORDER BY e."updatedAt" LIMIT p_limit
$$;

-- Création d'une entreprise par l'opérateur de la plateforme : vérifie que le code est libre.
CREATE OR REPLACE FUNCTION app_slug_available(p_slug text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM "organizations" o WHERE o."slug" = lower(p_slug))
$$;

REVOKE ALL ON FUNCTION app_org_by_slug(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_session_org(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_active_org_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_stale_queued_emails(timestamptz, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_slug_available(text) FROM PUBLIC;

-- =============================================================================
-- Droits du rôle applicatif (créé par infra/db/init/00-roles.sql)
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'aussitot_app') THEN
    GRANT USAGE ON SCHEMA public TO aussitot_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO aussitot_app;
    IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
      REVOKE ALL ON TABLE "_prisma_migrations" FROM aussitot_app;
    END IF;
    GRANT EXECUTE ON FUNCTION app_current_org() TO aussitot_app;
    GRANT EXECUTE ON FUNCTION app_unaccent(text) TO aussitot_app;
    GRANT EXECUTE ON FUNCTION app_org_by_slug(text) TO aussitot_app;
    GRANT EXECUTE ON FUNCTION app_session_org(text) TO aussitot_app;
    GRANT EXECUTE ON FUNCTION app_active_org_ids() TO aussitot_app;
    GRANT EXECUTE ON FUNCTION app_stale_queued_emails(timestamptz, integer) TO aussitot_app;
    GRANT EXECUTE ON FUNCTION app_slug_available(text) TO aussitot_app;
    -- Les entreprises ne sont jamais supprimées par l'API (opérateur uniquement).
    REVOKE DELETE ON TABLE "organizations" FROM aussitot_app;
    -- Journal d'activité : ajout seul, jamais réécrit ni effacé par l'API.
    REVOKE UPDATE, DELETE ON TABLE "activity_logs" FROM aussitot_app;
    -- Tables créées par les migrations futures : mêmes droits par défaut
    -- (chaque nouvelle table DOIT aussi recevoir sa politique tenant_isolation).
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO aussitot_app;
  END IF;
END
$$;
