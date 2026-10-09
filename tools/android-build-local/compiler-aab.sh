#!/bin/bash
# Compile le .aab Android de store (processeur arm64 seulement, pour aller vite).
# Usage : ANDROID_HOME=<kit android> ./compiler-aab.sh <copie du projet, déjà passée par `expo prebuild`>
# Variables : MIROIR_MAVEN=1 (réseau restreint, voir README.md), TENTATIVES=30 (nombre d'essais max).
set -u
PROJET="${1:?Indiquer la copie du projet (dossier contenant android/)}"
: "${ANDROID_HOME:?Indiquer ANDROID_HOME (kit Android)}"
ICI="$(cd "$(dirname "$0")" && pwd)"
export ANDROID_SDK_ROOT="$ANDROID_HOME" CI=1
export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-https://api.exemple-societe.fr/api/v1}"
echo "sdk.dir=$ANDROID_HOME" > "$PROJET/android/local.properties"
if [ "${MIROIR_MAVEN:-}" = "1" ]; then
  export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$PROJET/.gradle-home}"
  mkdir -p "$GRADLE_USER_HOME/init.d" && cp "$ICI/miroir-maven.gradle" "$GRADLE_USER_HOME/init.d/"
fi
JOURNAL="$PROJET/android-build.log"
cd "$PROJET/android" || exit 1
for i in $(seq 1 "${TENTATIVES:-30}"); do
  echo "=== tentative $i à $(date +%T)"
  ./gradlew :app:bundleRelease --no-daemon --console=plain -PreactNativeArchitectures=arm64-v8a \
    "-Dorg.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g -Dorg.gradle.internal.repository.max.tentatives=8 -Dorg.gradle.internal.repository.initial.backoff=3000" \
    > "$JOURNAL" 2>&1
  code=$?
  if [ $code -eq 0 ]; then echo "SUCCÈS : $PROJET/android/app/build/outputs/bundle/release/app-release.aab"; exit 0; fi
  if ! grep -qE "429|Too Many Requests" "$JOURNAL"; then echo "ÉCHEC (pas lié au réseau) — voir $JOURNAL"; tail -30 "$JOURNAL"; exit 1; fi
  echo "limitation réseau (429) : nouvel essai dans 45 s"; sleep 45
done
echo "ABANDON après ${TENTATIVES:-30} tentatives"; exit 2
