import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  View,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
} from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { usePathname } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowUp, Check, CircleAlert, Mic, SquarePen, Volume2, VolumeX, X } from "lucide-react-native";
import { BRAND, classifyConfirmation } from "@aussitot/shared";
import { endpoints } from "@/api/endpoints";
import { useAuth } from "@/auth/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { fonts } from "@/theme/tokens";
import { EmptyState, IconButton, PressableScale, Text } from "@/ui";
import { ActionCard } from "./ActionCard";
import { ResultCard } from "./ResultCard";
import { VoiceOrb } from "./VoiceOrb";
import { useAssistantSession } from "./AssistantProvider";
import type { ChatItem } from "./useAssistant";
import { useVoiceReplies } from "./preferences";
import { dictationErrorMessage, stopSpeaking, useDictation } from "./voice";
import { suggestionsFor } from "./suggestions";

/**
 * L'assistant : une conversation où l'on écrit ou parle, et où chaque action
 * menée apparaît sous forme de carte (devis créé, facture, mission…). Les
 * actions sensibles s'affichent en attente de confirmation.
 *
 * - « screen » : plein écran (téléphone, ou route /assistant) ;
 * - « panel » : panneau latéral à droite sur ordinateur.
 */
export function AssistantView({ variant, onClose }: { variant: "screen" | "panel"; onClose?: () => void }) {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const { user, can } = useAuth();
  const session = useAssistantSession();
  const { items, busy, loaded, send, resolve, reset, pendingAction, listenPending, consumeListen, pendingDraft, consumeDraft } = session;
  const [voiceReplies, setVoiceReplies] = useVoiceReplies();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const status = useQuery({ queryKey: ["assistant-status"], queryFn: endpoints.assistant.status, staleTime: 60_000 });

  const onFinal = useCallback(
    (text: string) => {
      if (pendingAction) {
        const decision = classifyConfirmation(text);
        if (decision) {
          void resolve(pendingAction.id, decision, "voice");
          return;
        }
      }
      void send(text, "voice", pathname);
    },
    [pendingAction, resolve, send, pathname],
  );
  const dictation = useDictation(onFinal);

  // Ouverture par le bouton micro : on écoute tout de suite.
  const { start: startDictation, listening } = dictation;
  useEffect(() => {
    if (!listenPending) return;
    consumeListen();
    if (!listening) void startDictation();
  }, [listenPending, consumeListen, listening, startDictation]);

  // Exemple touché sur l'accueil : début de phrase à compléter.
  useEffect(() => {
    if (pendingDraft === null) return;
    setDraft(pendingDraft);
    consumeDraft();
    setTimeout(() => inputRef.current?.focus(), 250);
  }, [pendingDraft, consumeDraft]);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    stopSpeaking();
    if (pendingAction) {
      const decision = classifyConfirmation(text);
      if (decision) {
        void resolve(pendingAction.id, decision, "text");
        return;
      }
    }
    void send(text, "text", pathname);
  }, [draft, busy, pendingAction, resolve, send, pathname]);

  const onKeyPress = (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    // Sur ordinateur : Entrée envoie, Maj + Entrée passe à la ligne.
    const native = event.nativeEvent as TextInputKeyPressEventData & { shiftKey?: boolean };
    if (Platform.OS === "web" && native.key === "Enter" && !native.shiftKey) {
      (event as unknown as { preventDefault: () => void }).preventDefault();
      submit();
    }
  };

  const toggleListen = () => {
    if (dictation.listening) dictation.stop();
    else void dictation.start();
  };

  const scrollToEnd = () => scrollRef.current?.scrollToEnd({ animated: true });
  const last = items.at(-1);
  const thinking = busy && !(last?.kind === "assistant" && last.streaming) && !(last?.kind === "tool" && last.status === "running");
  const disabled = status.data && !status.data.enabled;
  const statusLabel = disabled
    ? "Indisponible"
    : dictation.listening
      ? "Je vous écoute…"
      : busy
        ? "Je m'en occupe…"
        : pendingAction
          ? "En attente de votre confirmation"
          : "Prêt";

  const header = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingHorizontal: variant === "panel" ? 16 : 12,
        paddingTop: variant === "screen" ? insets.top + 8 : 14,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: variant === "panel" ? colors.surface : colors.bg,
      }}
    >
      {variant === "screen" && onClose ? <IconButton icon={X} label="Fermer l'assistant" onPress={onClose} size={40} /> : null}
      <View style={{ flex: 1, paddingLeft: variant === "screen" && !onClose ? 6 : 0 }}>
        <Text variant="headline" accessibilityRole="header">
          Assistant
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }} accessibilityLiveRegion="polite">
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: disabled
                ? colors.textTertiary
                : dictation.listening
                  ? colors.spark
                  : busy
                    ? colors.accent
                    : pendingAction
                      ? colors.warning
                      : colors.success,
            }}
          />
          <Text variant="caption" tone="secondary">
            {statusLabel}
          </Text>
        </View>
      </View>
      {disabled ? null : (
        <>
          <IconButton
            icon={voiceReplies ? Volume2 : VolumeX}
            label={voiceReplies ? "Réponses à voix haute : activées" : "Réponses à voix haute : désactivées"}
            onPress={() => {
              if (voiceReplies) stopSpeaking();
              setVoiceReplies(!voiceReplies);
            }}
            size={40}
          />
          <IconButton
            icon={SquarePen}
            label="Nouvelle conversation"
            onPress={() => {
              stopSpeaking();
              void reset();
              setDraft("");
            }}
            disabled={busy || items.length === 0}
            size={40}
          />
        </>
      )}
      {variant === "panel" && onClose ? <IconButton icon={X} label="Fermer l'assistant" onPress={onClose} size={40} /> : null}
    </View>
  );

  const suggestions = suggestionsFor(can);

  const body = disabled ? (
    <View style={{ flex: 1, justifyContent: "center", padding: 24 }}>
      <EmptyState
        icon={Mic}
        tone="warning"
        title="Assistant indisponible"
        message={status.data?.reason ?? "L'assistant n'est pas disponible pour le moment."}
      />
    </View>
  ) : (
    <ScrollView
      ref={scrollRef}
      onContentSizeChange={scrollToEnd}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        padding: variant === "panel" ? 16 : 20,
        paddingBottom: 24,
        gap: 14,
        flexGrow: 1,
        width: "100%",
        maxWidth: 760,
        alignSelf: "center",
      }}
    >
      {!loaded ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : items.length === 0 ? (
        <Animated.View entering={FadeIn.duration(260)} style={{ flex: 1, justifyContent: "center", gap: 22, paddingVertical: 24 }}>
          <View style={{ gap: 8 }}>
            <Text variant={variant === "panel" ? "title2" : "title1"}>
              {user ? `${user.firstName}, que puis-je faire pour vous ?` : "Que puis-je faire pour vous ?"}
            </Text>
            <Text variant="callout" tone="secondary">
              Parlez ou écrivez comme à un collègue. Je prépare, vous validez : rien ne part chez un client sans votre accord.
            </Text>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {suggestions.map((s) => (
              <PressableScale
                key={s.label}
                onPress={() => {
                  if (s.mode === "send") void send(s.text, "text", pathname);
                  else {
                    setDraft(s.text);
                    inputRef.current?.focus();
                  }
                }}
                accessibilityHint={s.mode === "prefill" ? "Complète la zone de saisie" : "Envoie la question"}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                }}
                pressedStyle={{ backgroundColor: colors.surfacePressed }}
              >
                <Text variant="subhead" weight="medium">
                  {s.label}
                </Text>
              </PressableScale>
            ))}
          </View>
        </Animated.View>
      ) : (
        items.map((item) => <ChatRow key={item.id} item={item} onResolve={(id, decision) => void resolve(id, decision)} />)
      )}
      {thinking ? <ThinkingDots /> : null}
    </ScrollView>
  );

  const composer = disabled ? null : (
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: colors.border,
        backgroundColor: variant === "panel" ? colors.surface : colors.bg,
        paddingHorizontal: variant === "panel" ? 12 : 16,
        paddingTop: 10,
        paddingBottom: (variant === "screen" ? insets.bottom : 0) + 12,
        gap: 8,
      }}
    >
      {dictation.listening || dictation.partial ? (
        <Animated.View
          entering={FadeInDown.duration(160)}
          style={{ flexDirection: "row", gap: 8, alignItems: "center", paddingHorizontal: 4 }}
          accessibilityLiveRegion="polite"
        >
          <Mic size={15} color={colors.sparkText} />
          <Text variant="subhead" tone={dictation.partial ? "primary" : "secondary"} style={{ flex: 1 }} numberOfLines={3}>
            {dictation.partial || "Je vous écoute… parlez naturellement."}
          </Text>
        </Animated.View>
      ) : null}
      {dictation.error ? (
        <PressableScale
          onPress={dictation.clearError}
          scaleTo={1}
          accessibilityRole="alert"
          style={{ flexDirection: "row", gap: 8, alignItems: "center", paddingHorizontal: 4 }}
        >
          <CircleAlert size={15} color={colors.danger} />
          <Text variant="footnote" tone="danger" style={{ flex: 1 }}>
            {dictationErrorMessage(dictation.error)}
          </Text>
        </PressableScale>
      ) : null}
      <View style={{ width: "100%", maxWidth: 760, alignSelf: "center", flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "flex-end",
            minHeight: 52,
            borderRadius: 26,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            backgroundColor: colors.surface,
            paddingLeft: 18,
            paddingRight: 6,
            paddingVertical: 5,
          }}
        >
          <TextInput
            ref={inputRef}
            testID="assistant-input"
            value={draft}
            onChangeText={setDraft}
            onKeyPress={onKeyPress}
            placeholder={pendingAction ? "Répondez « oui » ou « non »…" : "Écrivez ou appuyez sur le micro…"}
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel="Message pour l'assistant"
            multiline
            numberOfLines={Platform.OS === "web" ? Math.min(5, Math.max(1, draft.split("\n").length)) : undefined}
            maxLength={4000}
            editable={!busy}
            style={[
              {
                flex: 1,
                fontSize: 16,
                lineHeight: 22,
                fontFamily: fonts.regular,
                color: colors.text,
                maxHeight: 140,
                paddingTop: 10,
                paddingBottom: 10,
              },
              Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null,
            ]}
          />
          {draft.trim() ? (
            <IconButton
              icon={ArrowUp}
              label="Envoyer"
              variant="filled"
              onPress={submit}
              size={40}
              disabled={busy}
              testID="assistant-send"
            />
          ) : null}
        </View>
        <VoiceOrb
          size={52}
          listening={dictation.listening}
          thinking={busy}
          level={dictation.level}
          onPress={toggleListen}
          label={dictation.listening ? "Arrêter l'écoute" : `Parler à ${BRAND.assistantName}`}
        />
      </View>
    </View>
  );

  const content = (
    <View style={{ flex: 1, backgroundColor: variant === "panel" ? colors.surface : colors.bg }}>
      {header}
      {body}
      {composer}
    </View>
  );
  if (variant === "panel") return content;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {content}
    </KeyboardAvoidingView>
  );
}

function ChatRow({ item, onResolve }: { item: ChatItem; onResolve: (actionId: string, decision: "confirm" | "cancel") => void }) {
  const { colors, radius } = useTheme();
  switch (item.kind) {
    case "user":
      return (
        <Animated.View
          entering={FadeInDown.duration(180)}
          style={{ alignSelf: "flex-end", maxWidth: "86%", gap: 4, alignItems: "flex-end" }}
        >
          <View
            style={{
              backgroundColor: colors.accentFill,
              borderRadius: radius.lg,
              borderBottomRightRadius: 6,
              paddingHorizontal: 14,
              paddingVertical: 10,
            }}
          >
            <Text variant="body" tone="onAccent">
              {item.text}
            </Text>
          </View>
          {item.mode === "voice" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }} accessibilityLabel="Message dicté">
              <Mic size={12} color={colors.textTertiary} />
              <Text variant="caption" tone="tertiary">
                Dicté
              </Text>
            </View>
          ) : null}
        </Animated.View>
      );
    case "assistant":
      return (
        <Animated.View entering={FadeIn.duration(160)} style={{ maxWidth: "94%" }}>
          <Text variant="body" selectable>
            {item.text}
            {item.streaming ? (
              <Text variant="body" tone="accent">
                {" ▍"}
              </Text>
            ) : null}
          </Text>
        </Animated.View>
      );
    case "tool":
      return (
        <Animated.View entering={FadeIn.duration(160)} style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {item.status === "running" ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : item.status === "done" ? (
              <Check size={16} color={colors.success} strokeWidth={2.6} />
            ) : (
              <CircleAlert size={16} color={colors.danger} />
            )}
            <Text variant="footnote" tone={item.status === "failed" ? "danger" : "secondary"} style={{ flex: 1 }}>
              {item.status === "running" ? `${item.label}…` : (item.summary ?? item.label)}
            </Text>
          </View>
          {item.card ? <ResultCard card={item.card} /> : null}
        </Animated.View>
      );
    case "action":
      return (
        <ActionCard
          action={item.action}
          resultSummary={item.resultSummary}
          card={item.card}
          busy={item.busy}
          onConfirm={() => onResolve(item.action.id, "confirm")}
          onCancel={() => onResolve(item.action.id, "cancel")}
        />
      );
    case "error":
      return (
        <View
          accessibilityRole="alert"
          style={{
            flexDirection: "row",
            gap: 8,
            alignItems: "flex-start",
            backgroundColor: colors.dangerSoft,
            borderRadius: radius.md,
            padding: 12,
          }}
        >
          <CircleAlert size={17} color={colors.danger} />
          <Text variant="subhead" tone="danger" style={{ flex: 1 }}>
            {item.text}
          </Text>
        </View>
      );
  }
}

/** Trois points qui pulsent pendant que l'assistant réfléchit. */
function ThinkingDots() {
  const { colors, reduceMotion } = useTheme();
  return (
    <View
      style={{ flexDirection: "row", gap: 5, paddingVertical: 6 }}
      accessibilityLabel="L'assistant réfléchit"
      accessibilityRole="progressbar"
    >
      {[0, 1, 2].map((i) => (
        <Dot key={i} delay={i * 160} color={colors.textTertiary} still={reduceMotion} />
      ))}
    </View>
  );
}

function Dot({ delay, color, still }: { delay: number; color: string; still: boolean }) {
  const opacity = useSharedValue(0.3);
  useEffect(() => {
    if (still) return;
    const timer = setTimeout(() => {
      opacity.value = withRepeat(withSequence(withTiming(1, { duration: 380 }), withTiming(0.3, { duration: 380 })), -1, false);
    }, delay);
    return () => clearTimeout(timer);
  }, [delay, opacity, still]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }, style]} />;
}
