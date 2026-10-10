import type { Role } from "./roles";
import type { Unit } from "./catalog";
import type {
  ClientKind,
  EmailStatus,
  InvoiceKind,
  InvoiceStatus,
  MissionStatus,
  PaymentMethod,
  QuoteStatus,
  VatRegime,
} from "./statuses";
import type { VatBreakdownEntry } from "./money";

/**
 * Formes des réponses de l'API (JSON). Les dates « jour » sont des chaînes
 * AAAA-MM-JJ ; les instants sont des chaînes ISO 8601 en UTC.
 */

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface OrganizationDto {
  id: string;
  slug: string;
  name: string;
  legalName: string | null;
  legalForm: string | null;
  shareCapital: string | null;
  siren: string | null;
  siret: string | null;
  vatNumber: string | null;
  rcs: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  iban: string | null;
  bic: string | null;
  vatRegime: VatRegime;
  defaultVatRateBps: number;
  paymentTermsDays: number;
  quoteValidityDays: number;
  latePenaltyText: string | null;
  timezone: string;
  quotePrefix: string;
  invoicePrefix: string;
  creditNotePrefix: string;
  brandColor: string | null;
  emailSignature: string | null;
  hasLogo: boolean;
  plan: string;
  assistantEnabled: boolean;
}

export interface SessionUserDto {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string | null;
  role: Role;
  mustChangePassword: boolean;
  organization: { id: string; slug: string; name: string; timezone: string; hasLogo: boolean; brandColor: string | null };
}

export interface AuthResponseDto {
  accessToken: string;
  /** Présent uniquement pour les apps natives ; sur le web il est posé en cookie httpOnly. */
  refreshToken?: string;
  expiresIn: number;
  user: SessionUserDto;
}

export interface UserDto {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  weeklyHours: number | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface CreatedUserDto {
  user: UserDto;
  /** Affiché UNE seule fois à la RH, jamais stocké en clair. */
  temporaryPassword: string;
}

export interface ClientDto {
  id: string;
  kind: ClientKind;
  name: string;
  contactFirstName: string | null;
  contactLastName: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  siren: string | null;
  siret: string | null;
  vatNumber: string | null;
  notes: string | null;
  createdAt: string;
  /** Résumé commercial (fiche client). */
  stats?: { quotesCount: number; invoicedCents: number; outstandingCents: number };
}

export interface SiteDto {
  id: string;
  name: string;
  clientId: string | null;
  clientName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  accessNotes: string | null;
  isActive: boolean;
}

export interface CatalogItemDto {
  id: string;
  name: string;
  description: string | null;
  unit: Unit;
  unitPriceCents: number;
  vatRateBps: number;
  isActive: boolean;
}

export interface DocumentLineDto {
  id: string;
  position: number;
  description: string;
  quantity: number;
  unit: Unit;
  unitPriceCents: number;
  vatRateBps: number;
  discountBps: number;
  totalHtCents: number;
  catalogItemId: string | null;
}

export interface QuoteSummaryDto {
  id: string;
  number: string;
  status: QuoteStatus;
  title: string | null;
  clientId: string;
  clientName: string;
  issueDate: string;
  validUntil: string | null;
  subtotalCents: number;
  totalCents: number;
  sentAt: string | null;
}

export interface QuoteDto extends QuoteSummaryDto {
  siteId: string | null;
  siteName: string | null;
  notes: string | null;
  internalNotes: string | null;
  vatCents: number;
  vatBreakdown: VatBreakdownEntry[];
  vatExempt: boolean;
  lines: DocumentLineDto[];
  clientEmail: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  lastEmail: { status: EmailStatus; to: string; at: string; error: string | null } | null;
  invoiceIds: string[];
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceSummaryDto {
  id: string;
  kind: InvoiceKind;
  number: string | null;
  status: InvoiceStatus;
  title: string | null;
  clientId: string;
  clientName: string;
  issueDate: string | null;
  dueDate: string | null;
  totalCents: number;
  amountPaidCents: number;
  isOverdue: boolean;
}

export interface PaymentDto {
  id: string;
  amountCents: number;
  paidOn: string;
  method: PaymentMethod;
  reference: string | null;
  createdAt: string;
}

export interface InvoiceDto extends InvoiceSummaryDto {
  quoteId: string | null;
  quoteNumber: string | null;
  siteId: string | null;
  siteName: string | null;
  creditedInvoiceId: string | null;
  creditedInvoiceNumber: string | null;
  servicePeriod: string | null;
  notes: string | null;
  internalNotes: string | null;
  subtotalCents: number;
  vatCents: number;
  vatBreakdown: VatBreakdownEntry[];
  vatExempt: boolean;
  lines: DocumentLineDto[];
  payments: PaymentDto[];
  clientEmail: string | null;
  sentAt: string | null;
  paidAt: string | null;
  lastEmail: { status: EmailStatus; to: string; at: string; error: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

export interface PersonRefDto {
  id: string;
  firstName: string;
  lastName: string;
}

export interface MissionDto {
  id: string;
  title: string;
  status: MissionStatus;
  date: string;
  startTime: string;
  endTime: string;
  startsAt: string;
  endsAt: string;
  site: { id: string; name: string; address: string | null; accessNotes: string | null } | null;
  client: { id: string; name: string } | null;
  assignees: PersonRefDto[];
  teamLead: PersonRefDto | null;
  instructions: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  validatedAt: string | null;
}

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string;
  /** Écran de l'app à ouvrir au toucher (ex. « /planning/abc »). */
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface DashboardDto {
  greetingName: string;
  today: string;
  todayMissions: MissionDto[];
  nextMission: MissionDto | null;
  unreadNotifications: number;
  /** Présent pour les rôles qui pilotent la vente / la facturation. */
  sales?: {
    quotesToFollowUp: number;
    quotesPendingCents: number;
    invoicesOverdueCount: number;
    invoicesOverdueCents: number;
    invoicedThisMonthCents: number;
    collectedThisMonthCents: number;
    draftsCount: number;
  };
  team?: { activeMembers: number; missionsToday: number; missionsUnassigned: number };
}

export interface ActivityDto {
  id: string;
  action: string;
  label: string;
  entityType: string | null;
  entityId: string | null;
  actor: { id: string; name: string } | null;
  createdAt: string;
}
