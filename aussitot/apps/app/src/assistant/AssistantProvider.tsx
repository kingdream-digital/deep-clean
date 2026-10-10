import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useAssistant } from "./useAssistant";
import { useVoiceReplies } from "./preferences";

/**
 * Une seule conversation par personne connectée, partagée par l'écran
 * « Assistant » (téléphone) et le panneau latéral (ordinateur) : elle survit
 * à la navigation — l'assistant peut ouvrir un devis sans perdre le fil.
 */
type AssistantSession = ReturnType<typeof useAssistant> & {
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  /** Écoute demandée à l'ouverture (bouton micro de la barre) : consommée par la vue de l'assistant. */
  listenPending: boolean;
  requestListen: () => void;
  consumeListen: () => void;
  /** Début de phrase à placer dans la zone de saisie (exemple touché ailleurs que dans l'assistant). */
  pendingDraft: string | null;
  prefill: (text: string) => void;
  consumeDraft: () => void;
};

const AssistantContext = createContext<AssistantSession | null>(null);

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [voiceReplies] = useVoiceReplies();
  const session = useAssistant({ voiceReplies });
  const [panelOpen, setPanelOpen] = useState(false);
  const [listenPending, setListenPending] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<string | null>(null);
  const value = useMemo<AssistantSession>(
    () => ({
      ...session,
      panelOpen,
      setPanelOpen,
      listenPending,
      requestListen: () => setListenPending(true),
      consumeListen: () => setListenPending(false),
      pendingDraft,
      prefill: setPendingDraft,
      consumeDraft: () => setPendingDraft(null),
    }),
    [session, panelOpen, listenPending, pendingDraft],
  );
  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistantSession(): AssistantSession {
  const value = useContext(AssistantContext);
  if (!value) throw new Error("useAssistantSession doit être utilisé dans AssistantProvider");
  return value;
}
