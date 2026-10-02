import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Alert } from "../../utils/alert";
import { Ionicons } from "@expo/vector-icons";
import { useRoute, RouteProp } from "@react-navigation/native";
import { ScreenContainer } from "../../components/ScreenContainer";
import { StateView } from "../../components/StateView";
import { Card } from "../../components/Card";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { PressableScale } from "../../components/PressableScale";
import { ProblemStatusBadge } from "../../components/ProblemStatusBadge";
import { AuthenticatedImage } from "../../components/AuthenticatedImage";
import { useTheme } from "../../theme/ThemeProvider";
import { fontFamily } from "../../theme/typography";
import { useAuth } from "../../auth/AuthContext";
import { extractErrorMessage } from "../../api/client";
import { addProblemComment, getProblem, problemPhotoUrl, setProblemStatus } from "../../api/problems.api";
import type { Problem, ProblemStatus } from "../../api/problems.api";
import { downloadAndSharePhoto } from "../../utils/downloadPhoto";
import { useLiveFocusEffect, isBackgroundRefresh } from "../../sync/liveSync";

type Route = RouteProp<{ ProblemDetail: { problemId: string } }, "ProblemDetail">;

const TYPE_LABEL: Record<Problem["type"], { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  ISSUE: { label: "Problème", icon: "warning-outline" },
  MISSING_MATERIAL: { label: "Matériel manquant", icon: "cube-outline" },
};

const NEXT_STEP: Partial<Record<ProblemStatus, { status: Exclude<ProblemStatus, "NEW">; label: string }>> = {
  NEW: { status: "IN_PROGRESS", label: "Prendre en charge" },
  IN_PROGRESS: { status: "RESOLVED", label: "Marquer comme traité" },
  RESOLVED: { status: "VALIDATED", label: "Valider" },
};

function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.floor(hours / 24)} j`;
}

export function ProblemDetailScreen() {
  const { colors, spacing, radius, type: typeScale } = useTheme();
  const { user } = useAuth();
  const route = useRoute<Route>();
  const { problemId } = route.params;

  const [problem, setProblem] = useState<Problem | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [statusLoading, setStatusLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [commentLoading, setCommentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const silent = isBackgroundRefresh();
    try {
      if (!silent) setState("loading");
      const data = await getProblem(problemId);
      setProblem(data);
      setState("ready");
    } catch {
      if (!silent) setState("error");
    }
  }, [problemId]);

  useLiveFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (state === "loading") {
    return (
      <ScreenContainer>
        <StateView kind="loading" />
      </ScreenContainer>
    );
  }

  if (state === "error" || !problem) {
    return (
      <ScreenContainer>
        <StateView kind="error" onRetry={load} />
      </ScreenContainer>
    );
  }

  const canManage =
    user?.role === "DIRECTOR" ||
    user?.role === "ADMIN" ||
    user?.role === "SUPERVISOR" ||
    (user?.role === "SITE_MANAGER" && problem.site.managerId === user.id);
  const nextStep = NEXT_STEP[problem.status];
  const typeInfo = TYPE_LABEL[problem.type];

  async function handleAdvanceStatus() {
    if (!nextStep) return;
    setStatusLoading(true);
    try {
      const updated = await setProblemStatus(problemId, nextStep.status);
      setProblem(updated);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setStatusLoading(false);
    }
  }

  async function handleDownloadPhoto(photo: Problem["photos"][number], index: number) {
    setDownloadingId(photo.id);
    try {
      await downloadAndSharePhoto(problemId, photo.id, `signalement-${problemId.slice(0, 8)}-${index + 1}.jpg`);
    } catch (err) {
      Alert.alert("Téléchargement impossible", extractErrorMessage(err));
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleDownloadAllPhotos() {
    if (!problem) return;
    for (let i = 0; i < problem.photos.length; i += 1) {
      // Séquentiel : le partage natif s'ouvre une fois par fichier, l'enchaîner
      // en parallèle ferait apparaître plusieurs feuilles de partage à la fois.
      // eslint-disable-next-line no-await-in-loop
      await handleDownloadPhoto(problem.photos[i], i);
    }
  }

  async function handleSendComment() {
    if (!commentText.trim()) return;
    setCommentLoading(true);
    try {
      await addProblemComment(problemId, commentText.trim());
      setCommentText("");
      const updated = await getProblem(problemId);
      setProblem(updated);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setCommentLoading(false);
    }
  }

  return (
    <ScreenContainer avoidKeyboard>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: spacing.xxxl }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Ionicons name={typeInfo.icon} size={18} color={colors.inkSecondary} />
          <Text style={[typeScale.subhead, { color: colors.inkSecondary, marginLeft: spacing.xs, flex: 1 }]}>
            {typeInfo.label}
          </Text>
          <ProblemStatusBadge status={problem.status} />
        </View>

        <Text style={[typeScale.title2, { color: colors.ink, marginTop: spacing.sm }]}>{problem.description}</Text>

        <Text style={[typeScale.footnote, { color: colors.inkTertiary, marginTop: spacing.xs }]}>
          Signalé par {problem.reportedBy.firstName} {problem.reportedBy.lastName} · {timeAgo(problem.createdAt)}
          {problem.mission ? ` · Mission « ${problem.mission.title} »` : ""}
        </Text>

        {problem.photos.length > 0 && (
          <>
            {problem.photos.some((p) => p.daysUntilDeletion <= 3) && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: colors.warningSoft,
                  borderRadius: radius.md,
                  padding: spacing.md,
                  marginTop: spacing.lg,
                }}
              >
                <Ionicons name="alert-circle-outline" size={20} color={colors.warning} />
                <Text style={[typeScale.footnote, { color: colors.warning, marginLeft: spacing.sm, flex: 1 }]}>
                  {problem.photos.length === 1
                    ? "Cette photo sera"
                    : `Ces ${problem.photos.length} photos seront`}{" "}
                  supprimées automatiquement{" "}
                  {Math.min(...problem.photos.map((p) => p.daysUntilDeletion)) <= 0
                    ? "très bientôt"
                    : `dans ${Math.min(...problem.photos.map((p) => p.daysUntilDeletion))} j`}
                  . Téléchargez-les pour les archiver.
                </Text>
              </View>
            )}

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md }}>
              {problem.photos.map((photo, index) => (
                <View key={photo.id}>
                  <AuthenticatedImage
                    uri={problemPhotoUrl(problem.id, photo.id)}
                    style={{ width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.surface }}
                  />
                  <PressableScale
                    onPress={() => handleDownloadPhoto(photo, index)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Télécharger la photo ${index + 1}`}
                    style={{
                      position: "absolute",
                      bottom: 4,
                      right: 4,
                      width: 26,
                      height: 26,
                      borderRadius: radius.pill,
                      backgroundColor: colors.backgroundElevated,
                      alignItems: "center",
                      justifyContent: "center",
                      shadowColor: colors.shadow,
                      shadowOpacity: 0.3,
                      shadowRadius: 4,
                      shadowOffset: { width: 0, height: 1 },
                    }}
                  >
                    {downloadingId === photo.id ? (
                      <Ionicons name="ellipsis-horizontal" size={14} color={colors.accent} />
                    ) : (
                      <Ionicons name="download-outline" size={14} color={colors.accent} />
                    )}
                  </PressableScale>
                </View>
              ))}
            </View>

            {problem.photos.length > 1 && (
              <View style={{ marginTop: spacing.sm }}>
                <Button
                  label="Tout télécharger"
                  variant="secondary"
                  size="md"
                  icon="download-outline"
                  loading={downloadingId !== null}
                  onPress={handleDownloadAllPhotos}
                />
              </View>
            )}
          </>
        )}

        {canManage && nextStep && (
          <View style={{ marginTop: spacing.xl }}>
            <Button label={nextStep.label} onPress={handleAdvanceStatus} loading={statusLoading} />
          </View>
        )}
        {problem.status === "VALIDATED" && (
          <Text style={[typeScale.footnote, { color: colors.success, marginTop: spacing.md }]}>
            Ce signalement a été validé.
          </Text>
        )}

        {!!error && <Text style={[typeScale.footnote, { color: colors.danger, marginTop: spacing.md }]}>{error}</Text>}

        <Text style={[typeScale.overline, { color: colors.inkTertiary, marginTop: spacing.xl, marginBottom: spacing.sm }]}>
          SUIVI ({problem.comments.length})
        </Text>

        {problem.comments.length === 0 ? (
          <Text style={[typeScale.callout, { color: colors.inkTertiary }]}>Aucun commentaire pour le moment.</Text>
        ) : (
          <Card padded={false}>
            {problem.comments.map((comment, index) => (
              <View
                key={comment.id}
                style={{
                  flexDirection: "row",
                  gap: spacing.md,
                  padding: spacing.lg,
                  borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                  borderTopColor: colors.border,
                }}
              >
                <Avatar user={comment.author} size={36} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: spacing.sm }}>
                    <Text
                      numberOfLines={1}
                      style={[typeScale.subhead, { flexShrink: 1, color: colors.ink, fontFamily: fontFamily.semibold, fontWeight: "600" }]}
                    >
                      {comment.author.firstName} {comment.author.lastName}
                    </Text>
                    <Text style={[typeScale.caption, { color: colors.inkTertiary }]}>{timeAgo(comment.createdAt)}</Text>
                  </View>
                  <Text style={[typeScale.callout, { color: colors.inkSecondary, marginTop: 2 }]}>{comment.comment}</Text>
                </View>
              </View>
            ))}
          </Card>
        )}

        <View style={{ marginTop: spacing.md }}>
          <TextField label="Ajouter un commentaire" placeholder="Votre message" value={commentText} onChangeText={setCommentText} />
          <Button label="Envoyer" variant="secondary" onPress={handleSendComment} loading={commentLoading} disabled={!commentText.trim()} />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
