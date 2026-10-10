import { Platform } from "react-native";
import { fetch as expoFetch } from "expo/fetch";
import { API_URL, ApiError, getAccessToken, refreshSession } from "./client";

/**
 * Lecture d'un flux Server-Sent Events via fetch (et non EventSource, qui ne
 * permet pas d'envoyer le jeton d'accès). Sur téléphone, `expo/fetch` lit la
 * réponse au fil de l'eau ; sur le web, le fetch du navigateur.
 */
export interface StreamOptions {
  method?: "GET" | "POST";
  body?: unknown;
  signal?: AbortSignal;
  onEvent: (event: string, data: unknown) => void;
}

const doFetch = (Platform.OS === "web" ? globalThis.fetch.bind(globalThis) : expoFetch) as typeof globalThis.fetch;

export async function streamSse(path: string, options: StreamOptions, retried = false): Promise<void> {
  const token = getAccessToken();
  const res = await doFetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      accept: "text/event-stream",
      "x-client-platform": Platform.OS === "web" ? "web" : "native",
      ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  }).catch((err: Error) => {
    if (err.name === "AbortError") throw err;
    throw new ApiError(0, "NETWORK", "Pas de connexion internet.");
  });

  if (res.status === 401 && !retried) {
    if (await refreshSession()) return streamSse(path, options, true);
  }
  if (!res.ok || !res.body) {
    let message = "Le service est momentanément indisponible.";
    let code = "ERROR";
    try {
      const body = (await res.json()) as { error?: { code?: string; message?: string } };
      message = body.error?.message ?? message;
      code = body.error?.code ?? code;
    } catch {
      /* corps illisible */
    }
    throw new ApiError(res.status, code, message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let separator = buffer.indexOf("\n\n");
    while (separator !== -1) {
      const chunk = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      separator = buffer.indexOf("\n\n");
      let event = "message";
      const data: string[] = [];
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      if (data.length === 0) continue;
      try {
        options.onEvent(event, JSON.parse(data.join("\n")));
      } catch {
        /* événement illisible ignoré */
      }
    }
  }
}
