# Compiler l'application Android pour de vrai (sans EAS)

Prouve que le projet Android natif **compile** et produit le fichier `.aab` des stores,
et permet de lire le manifeste final (permissions, `targetSdk`…). Fait le 9 octobre 2026 :
`BUILD SUCCESSFUL` en 10 minutes (4 cœurs, un seul processeur : arm64), `.aab` de 32 Mo,
`targetSdk 36`, aucune permission sensible.

Ce n'est **pas** la voie normale de publication (voir `docs/PUBLICATION-STORES.md` : EAS construit
les apps dans le cloud). C'est un contrôle de santé, utile quand on change `app.json`, un plugin
ou une dépendance native. iOS ne peut pas être compilé hors d'un Mac.

## Prérequis (une fois, ≈ 2,5 Go)

JDK 17 ou 21, puis le kit Android (adapter `SDK`) :

```bash
SDK=$HOME/android-sdk
mkdir -p $SDK/cmdline-tools && cd /tmp
curl -sSL -o cmdline-tools.zip https://dl.google.com/android/repository/commandlinetools-linux-13114758_latest.zip
unzip -q cmdline-tools.zip -d $SDK/cmdline-tools && mv $SDK/cmdline-tools/cmdline-tools $SDK/cmdline-tools/latest
yes | $SDK/cmdline-tools/latest/bin/sdkmanager --sdk_root=$SDK --licenses
$SDK/cmdline-tools/latest/bin/sdkmanager --sdk_root=$SDK "platform-tools" "platforms;android-36" \
  "build-tools;36.0.0" "ndk;27.1.12297006" "cmake;3.22.1"
```

(Les versions suivent `node_modules/react-native/gradle/libs.versions.toml` : à ajuster si le SDK Expo change.)

## Compiler

```bash
# 1. Copier le projet HORS du dépôt (le dossier android/ généré ne doit pas y entrer)
mkdir /tmp/build-android && cd application/mobile
tar --exclude=./node_modules --exclude=./.env -cf - . | (cd /tmp/build-android && tar -xf -)
cp -a node_modules /tmp/build-android/node_modules
cd /tmp/build-android && npx expo prebuild --platform android --no-install --clean

# 2. Compiler (adresse d'API factice : seul le fichier compte)
ANDROID_HOME=$HOME/android-sdk /chemin/vers/tools/android-build-local/compiler-aab.sh /tmp/build-android
# -> /tmp/build-android/android/app/build/outputs/bundle/release/app-release.aab
```

Manifeste final à relire : `android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml`.

## Réseau restreint (bac à sable, proxy d'entreprise)

Si Maven Central répond `429 Too Many Requests` (limitation du proxy), lancer le script avec
`MIROIR_MAVEN=1` : il installe `miroir-maven.gradle`, qui place le miroir public de Google
(`maven-central.storage-download.googleapis.com`) **en premier** dans chaque liste de dépôts, et
conserve le portail de plugins Gradle derrière. Le script réessaie ensuite tant que l'échec est
une limitation réseau (le cache de Gradle conserve ce qui a déjà été téléchargé).
Sur un réseau normal, ne pas l'utiliser.
