// Version des données de l'entreprise (retour explicite du client : « quand
// on change quelque chose, ça doit changer toutes les infos partout »).
//
// Chaque modification réussie via l'API (création, modification, validation,
// suppression…) fait avancer ce numéro. Les applications ouvertes le
// consultent régulièrement (GET /api/v1/sync/version) et rechargent l'écran
// affiché dès qu'il change : un pointage validé sur l'ordinateur apparaît
// tout seul sur le téléphone, sans fermer ni rouvrir l'écran.
//
// Le numéro est en mémoire (une seule instance de l'API) ; l'identifiant de
// démarrage garantit qu'après un redémarrage les applications voient un
// numéro différent et rechargent par sécurité.
const bootId = Date.now().toString(36);
let counter = 0;

export function bumpChangeVersion(): void {
  counter += 1;
}

export function currentChangeVersion(): string {
  return `${bootId}-${counter}`;
}

// Requêtes qui ne changent aucune donnée visible par les autres : session
// (connexion, renouvellement, déconnexion), lecture d'une notification ou
// d'un fil, jeton push.
const IGNORED_PATHS = [/^\/api\/v1\/auth\//, /^\/api\/v1\/notifications\//, /\/read$/];

export function isTrackedMutation(method: string, path: string): boolean {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
  return !IGNORED_PATHS.some((re) => re.test(path));
}
