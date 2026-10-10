import { useAuth } from "@/auth/AuthProvider";
import { goTopLevel } from "@/navigation/goTopLevel";
import { Segmented } from "@/ui";

type Section = "devis" | "factures" | "clients";

/** Bascule Devis / Factures / Clients (les factures n'apparaissent qu'aux rôles qui facturent). */
export function SalesTabs({ value }: { value: Section }) {
  const { can } = useAuth();
  const options: { value: Section; label: string }[] = [
    { value: "devis", label: "Devis" },
    ...(can("invoices.read") ? [{ value: "factures" as const, label: "Factures" }] : []),
    { value: "clients", label: "Clients" },
  ];
  return <Segmented options={options} value={value} onChange={(next) => next !== value && goTopLevel(`/${next}`)} />;
}
