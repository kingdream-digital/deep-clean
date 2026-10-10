import {
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_TONES,
  MISSION_STATUS_LABELS,
  MISSION_STATUS_TONES,
  QUOTE_STATUS_LABELS,
  QUOTE_STATUS_TONES,
  type InvoiceKind,
  type InvoiceStatus,
  type MissionStatus,
  type QuoteStatus,
} from "@aussitot/shared";
import { Badge } from "@/ui";

export function QuoteStatusBadge({ status }: { status: QuoteStatus }) {
  return <Badge label={QUOTE_STATUS_LABELS[status]} tone={QUOTE_STATUS_TONES[status]} />;
}

export function InvoiceStatusBadge({ status, overdue, kind }: { status: InvoiceStatus; overdue?: boolean; kind?: InvoiceKind }) {
  if (kind === "CREDIT_NOTE") return <Badge label="Avoir" tone="neutral" />;
  if (overdue) return <Badge label="En retard" tone="danger" />;
  return <Badge label={INVOICE_STATUS_LABELS[status]} tone={INVOICE_STATUS_TONES[status]} />;
}

export function MissionStatusBadge({ status }: { status: MissionStatus }) {
  return <Badge label={MISSION_STATUS_LABELS[status]} tone={MISSION_STATUS_TONES[status]} />;
}
