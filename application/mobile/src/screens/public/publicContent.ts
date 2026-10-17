import type { ImageSourcePropType } from "react-native";
import type { Ionicons } from "@expo/vector-icons";
import type { PublicService } from "../../api/public.api";

// Profils du filtre « Vous êtes : » (mêmes règles que le site).
export type Audience = "particulier" | "professionnel" | "proprietaire";

// Contenu de l'accueil public de l'application : textes et photos repris du
// site officiel deep-clean.fr (version « La Plongée », dossier v2/ du dépôt ;
// photos Pexels sous licence libre, voir v2/assets/photos/CREDITS.md). Rien
// d'inventé : à mettre à jour ici si le site change.

export const UNIVERSES: { title: string; text: string; tags: string[]; image: ImageSourcePropType; service: PublicService; for: Audience[]; cta: string }[] = [
  {
    title: "Nettoyage en profondeur",
    service: "Nettoyage en profondeur",
    for: ["particulier", "professionnel", "proprietaire"],
    cta: "Demander un devis",
    text: "Une remise à neuf complète, pièce par pièce : sols, surfaces, vitres et recoins retrouvent un état impeccable, digne d'un intérieur neuf.",
    tags: ["Cuisine", "Salle de bain", "Avant une vente ou un état des lieux"],
    image: require("../../../assets/discover/profondeur.jpg"),
  },
  {
    title: "Entretien régulier",
    service: "Entretien régulier",
    for: ["particulier", "professionnel"],
    cta: "Demander un devis",
    text: "Un entretien régulier et fiable qui préserve, semaine après semaine, la qualité d'un intérieur déjà soigné.",
    tags: ["Hebdomadaire", "Ponctuel", "Selon votre rythme"],
    image: require("../../../assets/discover/entretien.jpg"),
  },
  {
    title: "Bureaux & espaces professionnels",
    service: "Bureaux & espaces pro",
    for: ["professionnel"],
    cta: "Demander un devis",
    text: "Des locaux irréprochables du matin au soir, pour accueillir vos clients et vos équipes dans un cadre à la hauteur de votre image.",
    tags: ["Bureaux", "Accueil", "Horaires adaptés"],
    image: require("../../../assets/discover/bureaux.jpg"),
  },
  {
    title: "Conciergerie",
    service: "Conciergerie",
    for: ["proprietaire"],
    cta: "Confier mon bien",
    text: "Un bien impeccable entre deux séjours : suivi régulier, coordination des passages et vigilance sur l'état général du logement — sans avoir à vous en soucier.",
    tags: ["Entre deux séjours", "Clés & accès", "Suivi régulier"],
    image: require("../../../assets/discover/conciergerie.jpg"),
  },
];

export const SPECIFIC_CARE: { title: string; text: string; image: ImageSourcePropType; service: PublicService; for: Audience[] }[] = [
  { title: "Canapés & fauteuils", service: "Canapés & fauteuils", for: ["particulier", "professionnel", "proprietaire"], text: "Assises traitées en profondeur, avec des méthodes respectueuses de chaque textile.", image: require("../../../assets/discover/canape.jpg") },
  { title: "Matelas", service: "Matelas", for: ["particulier", "proprietaire"], text: "Un traitement en profondeur, respectueux des matières, pour un couchage plus sain.", image: require("../../../assets/discover/matelas.jpg") },
  { title: "Textiles, sols & vitres", service: "Textiles, sols & vitres", for: ["particulier", "professionnel", "proprietaire"], text: "Sols retrouvés, vitres parfaitement claires, textiles ravivés jusque dans les finitions.", image: require("../../../assets/discover/vitres.jpg") },
];

export const METHOD: { title: string; text: string; image: ImageSourcePropType }[] = [
  { title: "Diagnostic", text: "Chaque intérieur est observé avant d'être traité : matériaux, textiles, points sensibles identifiés un à un.", image: require("../../../assets/discover/diagnostic.jpg") },
  { title: "Protocole adapté", text: "Produits, méthodes et intensité sont choisis en fonction de chaque surface, jamais standardisés.", image: require("../../../assets/discover/protocole.jpg") },
  { title: "Exécution soignée", text: "Un travail méthodique, sans précipitation, avec la même attention du premier au dernier geste.", image: require("../../../assets/discover/execution.jpg") },
  { title: "Contrôle qualité", text: "Une vérification finale avant de considérer une intervention terminée — le détail fait la différence.", image: require("../../../assets/discover/controle.jpg") },
];

export const COMMITMENTS: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }[] = [
  { icon: "ribbon-outline", title: "Qualité", text: "Un niveau d'exigence constant, du premier geste au contrôle final, quelle que soit la surface confiée." },
  { icon: "time-outline", title: "Ponctualité", text: "Des créneaux tenus avec sérieux : votre temps et votre organisation sont respectés à chaque intervention." },
  { icon: "flask-outline", title: "Produits & matériel", text: "Des produits professionnels et un matériel entretenu, choisis pour préserver chaque surface autant que pour la révéler." },
  { icon: "people-outline", title: "Professionnalisme", text: "Une équipe discrète, formée et soigneuse, qui traite votre intérieur avec le même respect que le sien." },
  { icon: "swap-horizontal-outline", title: "Flexibilité", text: "Des interventions adaptées à votre rythme et à vos imprévus, sans jamais rogner sur la qualité du travail." },
];

export const FACTS = [
  { value: "24–48 h", label: "pour vous proposer un créneau" },
  { value: "100 %", label: "de produits professionnels" },
  { value: "RC Pro", label: "activité assurée" },
];

// Questions fréquentes : celles du site officiel, mot pour mot.
export const FAQ = [
  {
    q: "Sous quel délai pouvez-vous intervenir ?",
    a: "Nous répondons à chaque demande sous 24 à 48 h avec une proposition de créneau. Pour les besoins urgents — remise en état avant une vente ou un état des lieux — nous nous efforçons de nous adapter à votre calendrier.",
  },
  {
    q: "Le devis est-il gratuit ?",
    a: "Oui. Décrivez votre besoin par téléphone ou via le formulaire : nous revenons vers vous avec une proposition adaptée à votre intérieur ou à vos locaux.",
  },
  {
    q: "Quels produits utilisez-vous ?",
    a: "Nous travaillons exclusivement avec des produits professionnels, choisis en fonction de chaque surface et de chaque textile, pour un résultat efficace sans agresser vos matériaux.",
  },
  {
    q: "Quelle est votre zone d'intervention ?",
    a: "Nous intervenons à Manosque et dans les communes alentour : Forcalquier, Volx, Pierrevert, Gréoux-les-Bains, Sainte-Tulle, Villeneuve, Corbières et leurs environs.",
  },
  {
    q: "Êtes-vous assurés ?",
    a: "Oui, notre activité est couverte par une assurance responsabilité civile professionnelle, pour intervenir chez vous en toute sérénité.",
  },
  {
    q: "Comment se passe l'intervention si un membre de l'équipe doit entrer chez moi ?",
    a: "La confiance est au cœur de notre métier. Chaque intervenant est identifié, sérieux et habitué à travailler en toute discrétion, que vous soyez présent ou non. Les accès et les éventuelles clés qui nous sont confiés sont gérés avec la plus grande rigueur, et tout ce qui est vu ou manipulé chez vous reste strictement confidentiel.",
  },
  {
    q: "En quoi consiste votre volet conciergerie ?",
    a: "Au-delà du nettoyage ponctuel, nous accompagnons certains propriétaires dans le suivi régulier de leur bien : coordination des passages, attention portée aux détails entre deux séjours ou deux visites, vigilance sur l'état général du logement. Un service pensé pour les propriétaires exigeants qui souhaitent garder un bien impeccable sans avoir à s'en soucier.",
  },
];

// « Qui sommes-nous » : textes du site officiel (section fondateur).
export const ABOUT = {
  quote: "Chaque intervention est pensée comme si c'était notre propre maison.",
  author: "Romain Fedi",
  role: "Fondateur & responsable de Deep Clean",
  paragraphs: [
    "Romain Fedi a fondé Deep Clean à Manosque pour apporter aux particuliers comme aux professionnels un niveau de soin habituellement réservé à l'hôtellerie haut de gamme.",
    "Chaque intervention est pensée comme un service de conciergerie : discrétion, ponctualité, et un respect scrupuleux des matières, des meubles et des lieux confiés.",
  ],
};

// « Pièce par pièce » : exemples de points traités lors d'un nettoyage en
// profondeur (site officiel) ; « * » = soin spécifique, sur devis.
export const ROOMS: { name: string; icon: keyof typeof Ionicons.glyphMap; image: ImageSourcePropType; points: { label: string; onQuote?: boolean }[] }[] = [
  {
    name: "Cuisine",
    image: require("../../../assets/discover/cuisine.jpg"),
    icon: "restaurant-outline",
    points: [
      { label: "Plans de travail & crédence" },
      { label: "Façades & poignées des meubles" },
      { label: "Évier & robinetterie" },
      { label: "Électroménager (extérieur)" },
      { label: "Sols & recoins" },
    ],
  },
  {
    name: "Salle de bain",
    image: require("../../../assets/discover/sdb.jpg"),
    icon: "water-outline",
    points: [
      { label: "Sanitaires" },
      { label: "Douche, baignoire & parois" },
      { label: "Robinetterie & traces de calcaire" },
      { label: "Miroirs sans traces" },
      { label: "Sols & recoins" },
    ],
  },
  {
    name: "Séjour",
    image: require("../../../assets/discover/sejour.jpg"),
    icon: "tv-outline",
    points: [
      { label: "Surfaces & dépoussiérage" },
      { label: "Canapés & fauteuils", onQuote: true },
      { label: "Vitres intérieures" },
      { label: "Sols & tapis", onQuote: true },
      { label: "Plinthes & recoins" },
    ],
  },
  {
    name: "Chambre",
    image: require("../../../assets/discover/chambre.jpg"),
    icon: "bed-outline",
    points: [
      { label: "Dépoussiérage complet" },
      { label: "Matelas", onQuote: true },
      { label: "Textiles", onQuote: true },
      { label: "Sols & plinthes" },
      { label: "Vitres" },
    ],
  },
  {
    name: "Bureaux",
    image: require("../../../assets/discover/bureau.jpg"),
    icon: "briefcase-outline",
    points: [
      { label: "Postes de travail & surfaces" },
      { label: "Espace d'accueil" },
      { label: "Sanitaires" },
      { label: "Coin pause" },
      { label: "Sols & vitres", onQuote: true },
    ],
  },
];

// Fiches des services (une page par service dans l'accueil public), écrites
// à partir des textes du site officiel — rien d'inventé.
export interface ServiceSheet {
  service: PublicService;
  title: string;
  short: string;
  text: string;
  more?: string;
  image: ImageSourcePropType;
  for: Audience[];
  /** Ce que comprend le service (textes du site). */
  points?: string[];
  /** Détail pièce par pièce (nettoyage en profondeur). */
  rooms?: boolean;
  specific?: boolean;
}

const BUREAUX_POINTS = ROOMS.find((r) => r.name === "Bureaux")!.points.map((p) => p.label);

export const SERVICE_SHEETS: ServiceSheet[] = [
  {
    service: "Nettoyage en profondeur",
    title: "Nettoyage en profondeur",
    short: "Une remise à neuf, pièce par pièce",
    text: UNIVERSES[0]!.text,
    image: UNIVERSES[0]!.image,
    for: UNIVERSES[0]!.for,
    points: UNIVERSES[0]!.tags,
    rooms: true,
  },
  {
    service: "Entretien régulier",
    title: "Entretien régulier",
    short: "Semaine après semaine",
    text: UNIVERSES[1]!.text,
    image: UNIVERSES[1]!.image,
    for: UNIVERSES[1]!.for,
    points: UNIVERSES[1]!.tags,
  },
  {
    service: "Bureaux & espaces pro",
    title: "Bureaux & espaces professionnels",
    short: "Des locaux irréprochables",
    text: UNIVERSES[2]!.text,
    image: UNIVERSES[2]!.image,
    for: UNIVERSES[2]!.for,
    points: BUREAUX_POINTS,
  },
  {
    service: "Conciergerie",
    title: "Conciergerie",
    short: "Un bien impeccable entre deux séjours",
    text: UNIVERSES[3]!.text,
    more: "Au-delà du nettoyage ponctuel, nous accompagnons certains propriétaires dans le suivi régulier de leur bien : coordination des passages, attention portée aux détails entre deux séjours ou deux visites, vigilance sur l'état général du logement.",
    image: UNIVERSES[3]!.image,
    for: UNIVERSES[3]!.for,
    points: UNIVERSES[3]!.tags,
  },
  ...SPECIFIC_CARE.map((care) => ({
    service: care.service,
    title: care.title,
    short: "Soin spécifique, sur devis",
    text: care.text,
    image: care.image,
    for: care.for,
    specific: true,
  })),
];

export const AUDIENCE_LABEL: Record<Audience, string> = { particulier: "Particuliers", professionnel: "Professionnels", proprietaire: "Propriétaires" };

// « Comment ça marche » : le parcours réel de la demande de devis dans l'app.
export const HOW_IT_WORKS: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }[] = [
  { icon: "sparkles-outline", title: "Choisissez votre service", text: "Nettoyage en profondeur, entretien, bureaux, conciergerie ou soin spécifique." },
  { icon: "create-outline", title: "Décrivez votre besoin", text: "Quelques informations suffisent, sans créer de compte." },
  { icon: "checkmark-done-outline", title: "Recevez votre devis", text: "Nous revenons vers vous sous 24 à 48 h. Le devis est gratuit." },
];
