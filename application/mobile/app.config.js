// Complète app.json sans le remplacer (Expo passe son contenu dans `config`).
//
// Notifications push Android : elles passent par Firebase (FCM) et exigent le
// fichier google-services.json du projet Firebase de l'app. Ce fichier ne
// contient que des identifiants publics (il peut être versionné), mais il
// n'existe qu'une fois le projet Firebase créé — voir
// docs/PUBLICATION-STORES.md, étape « Notifications Android ».
//
//  - fichier présent (à la racine de mobile/) ou variable EAS GOOGLE_SERVICES_JSON
//    (type « fichier ») : il est branché sur le build Android ;
//  - sinon : rien ne change, l'app se construit exactement comme avant
//    (les notifications internes restent disponibles, seules les push Android
//    ne partent pas).
//
// Note : avec un fichier de configuration dynamique, la commande `npx expo install`
// ne peut plus ajouter seule un plugin à app.json — elle l'indique : ajouter alors
// la ligne du plugin à la main dans la liste `plugins` de app.json.
const fs = require("fs");
const path = require("path");

module.exports = ({ config }) => {
  const localFile = path.join(__dirname, "google-services.json");
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON || (fs.existsSync(localFile) ? "./google-services.json" : undefined);

  if (!googleServicesFile) return config;

  return {
    ...config,
    android: { ...config.android, googleServicesFile },
  };
};
