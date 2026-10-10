import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react-native";
import { Bell, CalendarDays, FileText, History, House, Settings, Users } from "lucide-react-native";
import type { Permission } from "@aussitot/shared";

/** Entrées de navigation principales (barre latérale sur ordinateur, barre d'onglets / « Plus » sur téléphone). */
export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: ComponentType<LucideProps>;
  /** Préfixes d'URL qui rendent l'entrée active. */
  match: string[];
  permission?: Permission;
  badge?: "notifications";
}

export const NAV_ITEMS: NavItem[] = [
  { key: "home", label: "Accueil", href: "/", icon: House, match: [] },
  { key: "planning", label: "Planning", href: "/planning", icon: CalendarDays, match: ["/planning"] },
  { key: "sales", label: "Ventes", href: "/devis", icon: FileText, match: ["/devis", "/factures", "/clients"], permission: "quotes.read" },
  { key: "team", label: "Équipe", href: "/equipe", icon: Users, match: ["/equipe"], permission: "users.read" },
  { key: "notifications", label: "Notifications", href: "/notifications", icon: Bell, match: ["/notifications"], badge: "notifications" },
  { key: "activity", label: "Activité", href: "/activite", icon: History, match: ["/activite"], permission: "activity.read" },
  { key: "settings", label: "Réglages", href: "/reglages", icon: Settings, match: ["/reglages"], permission: "org.update" },
];

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  return item.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Écrans de premier niveau : la barre d'onglets y est visible (masquée sur les détails et formulaires). */
export const TOP_LEVEL_PATHS = new Set(["/", "/planning", "/devis", "/factures", "/clients", "/notifications", "/profil", "/plus", "/equipe", "/activite", "/reglages"]);
