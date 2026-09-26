import React, { useEffect, useState } from "react";
import { Image, ImageProps, Platform } from "react-native";
import { apiClient, getCurrentAccessToken } from "../api/client";

interface AuthenticatedImageProps extends Omit<ImageProps, "source"> {
  uri: string;
}

// Les photos ne sont jamais accessibles via une URL publique permanente (voir
// docs/SECURITY.md) : chaque requête doit porter le token d'accès courant.
//
// Sur web, `<Image source={{ uri, headers }}>` de react-native-web IGNORE
// silencieusement `headers` (il se contente d'un `<img src=...>` classique) —
// un navigateur ne peut de toute façon pas attacher d'en-tête `Authorization`
// à une requête `<img>` (limitation de la plateforme web, pas de RNW). Sans
// ce composant, chaque photo de signalement resterait invisible sur web
// (requête non authentifiée → 401 côté serveur) — vérifié en conditions
// réelles, pas seulement en lisant le code. Sur web, on récupère donc l'image
// via `apiClient` (qui porte déjà le token et gère le rafraîchissement en cas
// de 401) et on la convertit en URL locale (`blob:`) pour l'afficher. Sur
// natif, où `headers` fonctionne réellement, le comportement reste inchangé.
export function AuthenticatedImage({ uri, ...rest }: AuthenticatedImageProps) {
  const token = getCurrentAccessToken();
  const [webObjectUrl, setWebObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    let cancelled = false;
    let objectUrl: string | null = null;

    (async () => {
      try {
        const res = await apiClient.get<ArrayBuffer>(uri, { responseType: "arraybuffer" });
        const contentType = (res.headers as Record<string, string>)["content-type"] ?? "image/jpeg";
        const blob = new Blob([res.data], { type: contentType });
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setWebObjectUrl(objectUrl);
      } catch {
        // Laisse `webObjectUrl` à `null` : rien ne s'affiche plutôt qu'une
        // erreur bloquante, cohérent avec un <Image> natif dont le
        // chargement échoue silencieusement.
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [uri]);

  if (Platform.OS === "web") {
    if (!webObjectUrl) return null;
    return <Image source={{ uri: webObjectUrl }} {...rest} />;
  }

  return <Image source={{ uri, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} {...rest} />;
}
