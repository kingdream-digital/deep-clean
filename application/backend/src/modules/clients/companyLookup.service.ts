import { logger } from "../../config/logger";
import { ApiError } from "../../utils/ApiError";

// Recherche d'une entreprise par SIRET ou SIREN pour pré-remplir la fiche
// d'un client ou d'un prospect (retour explicite du client). Source : l'API
// « Recherche d'entreprises » de l'État (annuaire-entreprises.data.gouv.fr),
// gratuite, sans clé, alimentée par le répertoire SIRENE de l'INSEE — même
// logique que l'API Adresse utilisée pour les chantiers (utils/geocoding.ts).
// Appelée uniquement par le serveur : le numéro saisi ne part jamais
// directement de l'application vers un service extérieur.
const API_URL = "https://recherche-entreprises.api.gouv.fr/search";
const REQUEST_TIMEOUT_MS = 8000;

// Mémoire des recherches réussies : la même entreprise recherchée à nouveau
// (fiche prospect puis fiche client, deux commerciaux…) ressort
// instantanément, sans rappeler l'annuaire. 24 h suffisent : nom et adresse
// changent rarement.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const cache = new Map<string, { at: number; result: CompanyLookupResult }>();

export function clearCompanyLookupCache(): void {
  cache.clear();
}

export interface CompanyLookupResult {
  companyName: string;
  siren: string;
  siret: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  // false = entreprise cessée ou établissement fermé : la fiche peut être
  // créée, mais l'application le signale.
  active: boolean;
  isHeadOffice: boolean;
}

interface ApiEstablishment {
  siret?: string;
  adresse?: string | null;
  code_postal?: string | null;
  libelle_commune?: string | null;
  etat_administratif?: string | null;
  est_siege?: boolean;
}

interface ApiCompany {
  siren?: string;
  nom_complet?: string | null;
  nom_raison_sociale?: string | null;
  etat_administratif?: string | null;
  siege?: ApiEstablishment | null;
  matching_etablissements?: ApiEstablishment[] | null;
}

// Données d'un entrepreneur individuel ayant demandé la non-diffusion :
// l'annuaire les masque, on n'affiche rien plutôt qu'un libellé technique.
function clean(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v || /NON-DIFFUSIBLE|\[ND\]/i.test(v)) return null;
  return v;
}

// L'annuaire renvoie l'adresse complète (« 59 RUE LA FAYETTE 75009 PARIS ») :
// la rue seule va dans « Adresse », le code postal et la ville dans leurs
// champs.
function streetOf(est: ApiEstablishment): string | null {
  const full = clean(est.adresse);
  if (!full) return null;
  const tail = [clean(est.code_postal), clean(est.libelle_commune)].filter(Boolean).join(" ");
  const street = tail && full.endsWith(tail) ? full.slice(0, -tail.length).trim() : full;
  return street || null;
}

// L'annuaire ajoute le sigle entre parenthèses au nom complet
// (« DEEP CLEAN (DEEP CLEAN) ») : on retire la répétition.
function displayName(name: string | null): string | null {
  const m = name?.match(/^(.*\S)\s*\(([^()]+)\)$/);
  if (m && m[1]!.trim().toUpperCase() === m[2]!.trim().toUpperCase()) return m[1]!.trim();
  return name;
}

export function normalizeCompanyNumber(raw: string): string {
  return raw.replace(/[\s.-]/g, "");
}

export async function lookupCompany(raw: string): Promise<CompanyLookupResult> {
  const number = normalizeCompanyNumber(raw);
  if (!/^(\d{9}|\d{14})$/.test(number)) {
    throw ApiError.badRequest("Saisissez un SIRET (14 chiffres) ou un SIREN (9 chiffres).");
  }
  const siren = number.slice(0, 9);

  const cached = cache.get(number);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.result;

  const result = await fetchCompany(number, siren);
  if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(number, { at: Date.now(), result });
  return result;
}

async function fetchCompany(number: string, siren: string): Promise<CompanyLookupResult> {
  let data: { results?: ApiCompany[] };
  try {
    const res = await fetch(`${API_URL}?q=${number}&page=1&per_page=5`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = (await res.json()) as { results?: ApiCompany[] };
  } catch (err) {
    logger.warn({ err }, "Recherche d'entreprise : annuaire indisponible");
    throw new ApiError(503, "LOOKUP_UNAVAILABLE", "L'annuaire des entreprises ne répond pas pour le moment. Réessayez, ou remplissez la fiche à la main.");
  }

  // La recherche est plein texte : on ne retient que l'entreprise dont le
  // SIREN correspond exactement au numéro saisi.
  const company = data.results?.find((c) => c.siren === siren);
  const name = company && displayName(clean(company.nom_complet) ?? clean(company.nom_raison_sociale));
  if (!company || !name) {
    throw ApiError.notFound("Aucune entreprise trouvée pour ce numéro. Vérifiez-le, ou remplissez la fiche à la main.");
  }

  // SIRET saisi : l'établissement précis (agence, site…) ; SIREN seul : le
  // siège social.
  const establishment =
    number.length === 14
      ? (company.matching_etablissements ?? []).find((e) => e.siret === number) ?? (company.siege?.siret === number ? company.siege : null)
      : company.siege ?? null;
  if (number.length === 14 && !establishment) {
    throw ApiError.notFound("Ce SIRET ne correspond à aucun établissement de l'entreprise. Vérifiez-le, ou cherchez par SIREN.");
  }

  return {
    companyName: name,
    siren,
    siret: establishment?.siret ?? null,
    address: establishment ? streetOf(establishment) : null,
    postalCode: clean(establishment?.code_postal),
    city: clean(establishment?.libelle_commune),
    active: company.etat_administratif !== "C" && establishment?.etat_administratif !== "F",
    isHeadOffice: establishment?.est_siege ?? establishment === company.siege,
  };
}
