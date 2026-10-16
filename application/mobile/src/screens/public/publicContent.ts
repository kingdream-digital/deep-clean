import type { ImageSourcePropType } from "react-native";
import type { Ionicons } from "@expo/vector-icons";
import type { PublicService } from "../../api/public.api";

// Contenu de l'accueil public de l'application : textes et photos repris du
// site officiel deep-clean.fr (version « La Plongée », dossier v2/ du dépôt ;
// photos Pexels sous licence libre, voir v2/assets/photos/CREDITS.md). Rien
// d'inventé : à mettre à jour ici si le site change.

export const UNIVERSES: { title: string; text: string; tags: string[]; image: ImageSourcePropType; service: PublicService }[] = [
  {
    title: "Nettoyage en profondeur",
    service: "Nettoyage en profondeur",
    text: "Une remise à neuf complète, pièce par pièce : sols, surfaces, vitres et recoins retrouvent un état impeccable, digne d'un intérieur neuf.",
    tags: ["Cuisine", "Salle de bain", "Avant une vente ou un état des lieux"],
    image: require("../../../assets/discover/profondeur.jpg"),
  },
  {
    title: "Entretien régulier",
    service: "Entretien régulier",
    text: "Un entretien régulier et fiable qui préserve, semaine après semaine, la qualité d'un intérieur déjà soigné.",
    tags: ["Hebdomadaire", "Ponctuel", "Selon votre rythme"],
    image: require("../../../assets/discover/entretien.jpg"),
  },
  {
    title: "Bureaux & espaces professionnels",
    service: "Bureaux & espaces pro",
    text: "Des locaux irréprochables du matin au soir, pour accueillir vos clients et vos équipes dans un cadre à la hauteur de votre image.",
    tags: ["Bureaux", "Accueil", "Horaires adaptés"],
    image: require("../../../assets/discover/bureaux.jpg"),
  },
  {
    title: "Conciergerie",
    service: "Conciergerie",
    text: "Un bien impeccable entre deux séjours : suivi régulier, coordination des passages et vigilance sur l'état général du logement.",
    tags: ["Entre deux séjours", "Clés & accès", "Suivi régulier"],
    image: require("../../../assets/discover/conciergerie.jpg"),
  },
];

export const SPECIFIC_CARE: { title: string; text: string; image: ImageSourcePropType; service: PublicService }[] = [
  { title: "Canapés & fauteuils", service: "Canapés & fauteuils", text: "Assises traitées en profondeur, dans le respect de chaque textile.", image: require("../../../assets/discover/canape.jpg") },
  { title: "Matelas", service: "Matelas", text: "Un traitement respectueux des matières, pour un couchage plus sain.", image: require("../../../assets/discover/matelas.jpg") },
  { title: "Textiles, sols & vitres", service: "Textiles, sols & vitres", text: "Sols retrouvés, vitres parfaitement claires, textiles ravivés.", image: require("../../../assets/discover/vitres.jpg") },
];

export const METHOD = [
  { title: "Diagnostic", text: "Matériaux, textiles et points sensibles identifiés un à un avant d'intervenir." },
  { title: "Protocole adapté", text: "Produits, méthodes et intensité choisis pour chaque surface, jamais standardisés." },
  { title: "Exécution soignée", text: "Un travail méthodique, sans précipitation, du premier au dernier geste." },
  { title: "Contrôle qualité", text: "Une vérification finale avant de considérer l'intervention terminée." },
];

export const COMMITMENTS: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string }[] = [
  { icon: "ribbon-outline", title: "Qualité", text: "Un niveau d'exigence constant, du premier geste au contrôle final." },
  { icon: "time-outline", title: "Ponctualité", text: "Des créneaux tenus avec sérieux : votre organisation est respectée." },
  { icon: "flask-outline", title: "Produits & matériel", text: "Des produits professionnels et un matériel entretenu." },
  { icon: "people-outline", title: "Professionnalisme", text: "Une équipe discrète, formée et soigneuse." },
  { icon: "swap-horizontal-outline", title: "Flexibilité", text: "Des interventions adaptées à votre rythme et à vos imprévus." },
];

export const FACTS = [
  { value: "24–48 h", label: "pour vous proposer un créneau" },
  { value: "100 %", label: "de produits professionnels" },
  { value: "RC Pro", label: "activité assurée" },
];

export const FAQ = [
  {
    q: "Sous quel délai pouvez-vous intervenir ?",
    a: "Nous répondons à chaque demande sous 24 à 48 h avec une proposition de créneau, et nous nous adaptons aux besoins urgents (vente, état des lieux).",
  },
  {
    q: "Le devis est-il gratuit ?",
    a: "Oui. Décrivez votre besoin par téléphone ou via le formulaire : nous revenons vers vous avec une proposition adaptée.",
  },
  {
    q: "Êtes-vous assurés ?",
    a: "Oui, notre activité est couverte par une assurance responsabilité civile professionnelle.",
  },
  {
    q: "En quoi consiste votre volet conciergerie ?",
    a: "Un suivi régulier de votre bien : coordination des passages, attention portée aux détails entre deux séjours, vigilance sur l'état général du logement.",
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
export const ROOMS: { name: string; icon: keyof typeof Ionicons.glyphMap; points: { label: string; onQuote?: boolean }[] }[] = [
  {
    name: "Cuisine",
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
