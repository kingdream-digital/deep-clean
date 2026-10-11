import { useState } from "react";
import { Image, Platform, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, FileText, ImageUp, Trash2, Wand2 } from "lucide-react-native";
import { BRAND_COLOR_PRESETS, brandTextOnWhite, readableTextOn, type OrganizationDto } from "@aussitot/shared";
import { endpoints, uploadLogo } from "@/api/endpoints";
import { ApiError } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { useOrgLogo } from "@/lib/logo";
import { openPdf } from "@/lib/pdf";
import { useBreakpoint, useTheme } from "@/theme/ThemeProvider";
import { Button, Card, ConfirmSheet, PressableScale, Segmented, Text, TextField, useToast } from "@/ui";
import { DocumentMiniPreview } from "./DocumentMiniPreview";

const DEFAULT_BRAND = "#2347F5";
const HEX = /^#[0-9A-Fa-f]{6}$/;

/** Enregistrement refusé avant l'ouverture d'un exemple (message déjà affiché). */
class NotSaved extends Error {}

const PRESET_NAMES: Record<(typeof BRAND_COLOR_PRESETS)[number], string> = {
  "#2347F5": "Bleu",
  "#4338CA": "Indigo",
  "#0E7490": "Bleu canard",
  "#15803D": "Vert",
  "#B45309": "Ambre",
  "#B91C1C": "Rouge",
  "#BE185D": "Framboise",
  "#334155": "Ardoise",
};

const SWATCH_GAP = 4;

function Swatch({
  color,
  label,
  selected,
  size,
  onPress,
}: {
  color: string;
  label: string;
  selected: boolean;
  size: number;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const inner = size - 10;
  return (
    <PressableScale
      onPress={onPress}
      haptic="selection"
      scaleTo={0.92}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 2,
        borderColor: selected ? colors.text : "transparent",
      }}
    >
      <View
        style={{
          width: inner,
          height: inner,
          borderRadius: inner / 2,
          backgroundColor: color,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {selected ? <Check size={18} color={readableTextOn(color)} strokeWidth={3} /> : null}
      </View>
    </PressableScale>
  );
}

/**
 * « Identité visuelle » des réglages : le logo et la couleur de l'entreprise
 * sur ses devis, factures et emails, avec un aperçu en direct et un PDF
 * d'exemple. Le logo s'enregistre dès l'envoi ; la couleur avec les réglages.
 */
export function BrandingSection({
  organization,
  draft,
  onColorChange,
  colorError,
  dirty,
  saveDraft,
}: {
  organization: OrganizationDto;
  /** Valeurs en cours de saisie (pas encore enregistrées). */
  draft: { name: string; brandColor: string; quotePrefix: string; invoicePrefix: string; vatRegime: string; defaultVatRateBps: string };
  onColorChange: (color: string) => void;
  colorError?: string;
  dirty: boolean;
  /** Enregistre les réglages en cours (avant d'ouvrir un PDF d'exemple) ; false si refusé, l'erreur étant déjà affichée. */
  saveDraft: () => Promise<boolean>;
}) {
  const { colors, radius } = useTheme();
  const { isWide } = useBreakpoint();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { reloadUser } = useAuth();
  const [kind, setKind] = useState<"invoice" | "quote">("invoice");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [opening, setOpening] = useState(false);
  // Pastilles sur une ligne si la place le permet (≥ 40 px chacune), sinon deux lignes de quatre à 44 px.
  const [swatchArea, setSwatchArea] = useState(0);
  const fitted = Math.min(44, Math.floor((swatchArea - 7 * SWATCH_GAP) / 8));
  const swatchesPerRow = swatchArea === 0 || fitted >= 40 ? 8 : 4;
  const swatchSize = swatchesPerRow === 8 && swatchArea > 0 ? fitted : 44;
  const logo = useOrgLogo(organization.id, organization.hasLogo ? organization.logoVersion : null);

  const typed = draft.brandColor.trim();
  const effective = HEX.test(typed) ? typed.toUpperCase() : DEFAULT_BRAND;
  const selected = typed === "" ? DEFAULT_BRAND : typed.toUpperCase();
  const adjusted = brandTextOnWhite(effective) !== effective || readableTextOn(effective) !== "#FFFFFF";
  const logoColor = organization.logoColor;
  const logoColorIsPreset = logoColor ? (BRAND_COLOR_PRESETS as readonly string[]).includes(logoColor) : false;

  const applied = (updated: OrganizationDto) => {
    queryClient.setQueryData(["organization"], updated);
    void reloadUser().catch(() => undefined);
  };

  const upload = useMutation({
    mutationFn: async () => {
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9, allowsMultipleSelection: false });
      if (picked.canceled || !picked.assets[0]) return null;
      const asset = picked.assets[0];
      return uploadLogo({
        uri: asset.uri,
        name: asset.fileName ?? "logo.png",
        type: asset.mimeType ?? "image/png",
        webFile: Platform.OS === "web" ? (asset.file ?? undefined) : undefined,
      });
    },
    onSuccess: (updated) => {
      if (!updated) return;
      applied(updated);
      toast(
        updated.logoColor && updated.logoColor !== selected
          ? "Logo enregistré. Sa couleur vous est proposée ci-dessous."
          : "Logo enregistré : il figure sur vos prochains devis et factures",
      );
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : "Le logo n'a pas pu être envoyé.", "error"),
  });

  const remove = useMutation({
    mutationFn: endpoints.organization.removeLogo,
    onSuccess: (updated) => {
      applied(updated);
      setConfirmRemove(false);
      toast("Logo retiré de vos prochains documents");
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : "Le logo n'a pas pu être retiré.", "error"),
  });

  const openExample = async (which: "invoice" | "quote") => {
    setOpening(true);
    try {
      await openPdf(
        endpoints.organization.previewPath(which),
        which === "quote" ? "Apercu-devis.pdf" : "Apercu-facture.pdf",
        dirty
          ? async () => {
              if (!(await saveDraft())) throw new NotSaved();
            }
          : undefined,
      );
    } catch (err) {
      if (!(err instanceof NotSaved)) toast(err instanceof ApiError ? err.message : "L'exemple n'a pas pu être ouvert.", "error");
    } finally {
      setOpening(false);
    }
  };

  const controls = (
    <View style={{ gap: 22, flex: isWide ? 1 : undefined, minWidth: 0 }}>
      {/* Logo */}
      <View style={{ gap: 12 }}>
        <View style={{ gap: 2 }}>
          <Text variant="headline">Logo</Text>
          <Text variant="footnote" tone="secondary">
            En tête de vos devis, factures et emails. PNG, JPEG ou WebP, 2 Mo au plus.
          </Text>
        </View>
        <PressableScale
          onPress={() => upload.mutate()}
          disabled={upload.isPending}
          haptic="light"
          scaleTo={0.99}
          accessibilityLabel={organization.hasLogo ? `Logo actuel de ${organization.name}. Remplacer le logo` : "Ajouter votre logo"}
          style={{
            height: 108,
            borderRadius: radius.md,
            // Fond blanc : le logo apparaît comme sur le papier.
            backgroundColor: "#FFFFFF",
            borderWidth: 1,
            borderColor: logo ? colors.border : colors.borderStrong,
            borderStyle: logo ? "solid" : "dashed",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            gap: 6,
          }}
          testID="branding-logo-tile"
        >
          {logo ? (
            <Image source={logo.source} style={{ width: "100%", height: 68 }} resizeMode="contain" />
          ) : (
            <>
              <ImageUp size={24} color="#64748B" />
              <Text variant="subhead" weight="semibold" style={{ color: "#0F172A" }}>
                Ajouter votre logo
              </Text>
              <Text variant="caption" style={{ color: "#64748B" }}>
                Fond transparent ou blanc conseillé
              </Text>
            </>
          )}
        </PressableScale>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Button
            label={organization.hasLogo ? "Remplacer" : "Choisir un fichier"}
            icon={ImageUp}
            size="sm"
            variant="secondary"
            loading={upload.isPending}
            onPress={() => upload.mutate()}
            testID="branding-upload"
          />
          {organization.hasLogo ? (
            <Button
              label="Retirer"
              icon={Trash2}
              size="sm"
              variant="ghost"
              onPress={() => setConfirmRemove(true)}
              testID="branding-remove"
            />
          ) : null}
        </View>
      </View>

      {/* Couleur */}
      <View style={{ gap: 12 }}>
        <View style={{ gap: 2 }}>
          <Text variant="headline">Couleur des documents</Text>
          <Text variant="footnote" tone="secondary">
            Titre, total et intitulés de vos devis, factures et emails.
          </Text>
        </View>

        {logoColor && !logoColorIsPreset ? (
          <PressableScale
            onPress={() => onColorChange(logoColor)}
            haptic="selection"
            scaleTo={0.98}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected === logoColor }}
            accessibilityLabel={`Couleur de votre logo, ${logoColor}`}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              padding: 10,
              borderRadius: radius.md,
              borderWidth: selected === logoColor ? 2 : 1,
              borderColor: selected === logoColor ? colors.text : colors.border,
              backgroundColor: colors.surfaceMuted,
            }}
            testID="branding-logo-color"
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: logoColor,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {selected === logoColor ? <Check size={18} color={readableTextOn(logoColor)} strokeWidth={3} /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="subhead" weight="semibold">
                Couleur de votre logo
              </Text>
              <Text variant="caption" tone="tertiary">
                Détectée automatiquement · {logoColor}
              </Text>
            </View>
            <Wand2 size={18} color={colors.textTertiary} />
          </PressableScale>
        ) : null}

        {/* Mesure sur toute la largeur disponible ; la grille elle-même peut être plus étroite. */}
        <View onLayout={(e) => setSwatchArea(e.nativeEvent.layout.width)}>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Couleurs proposées"
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: SWATCH_GAP,
              width: swatchesPerRow === 4 ? 4 * 44 + 3 * SWATCH_GAP : undefined,
            }}
          >
            {BRAND_COLOR_PRESETS.map((color) => (
              <Swatch
                key={color}
                color={color}
                size={swatchSize}
                label={`${PRESET_NAMES[color]}${logoColor === color ? " (couleur de votre logo)" : ""}`}
                selected={selected === color}
                onPress={() => onColorChange(color)}
              />
            ))}
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <View style={{ flex: 1, maxWidth: 220 }}>
            <TextField
              label="Couleur personnalisée"
              value={draft.brandColor}
              onChangeText={onColorChange}
              placeholder={DEFAULT_BRAND}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={7}
              error={colorError}
              hint="Code hexadécimal, ex. : #0E7490"
              testID="branding-hex"
            />
          </View>
          <View
            style={{
              width: 50,
              height: 50,
              marginTop: 25,
              borderRadius: radius.md,
              backgroundColor: effective,
              borderWidth: 1,
              borderColor: colors.border,
            }}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        </View>

        {adjusted ? (
          <Text variant="footnote" tone="secondary" testID="branding-contrast">
            Avec cette couleur, certains textes s'afficheront en gris foncé pour rester lisibles. La couleur reste utilisée pour les aplats.
          </Text>
        ) : null}
      </View>
    </View>
  );

  const preview = (
    <View style={{ gap: 12, flex: isWide ? 1 : undefined, minWidth: 0 }}>
      <Segmented<"invoice" | "quote">
        options={[
          { value: "invoice", label: "Facture" },
          { value: "quote", label: "Devis" },
        ]}
        value={kind}
        onChange={setKind}
      />
      <DocumentMiniPreview
        kind={kind}
        organizationName={draft.name.trim() || organization.name}
        brandColor={effective}
        logo={logo}
        numberPrefix={kind === "quote" ? draft.quotePrefix : draft.invoicePrefix}
        vatExempt={draft.vatRegime === "FRANCHISE"}
        vatRateBps={Number(draft.defaultVatRateBps) || 0}
      />
      <Button
        label={kind === "quote" ? "Voir un devis d'exemple (PDF)" : "Voir une facture d'exemple (PDF)"}
        icon={FileText}
        variant="secondary"
        loading={opening}
        onPress={() => void openExample(kind)}
        accessibilityHint="Ouvre un document fictif mis en page avec votre logo, votre couleur et vos mentions"
        testID="branding-example"
      />
      <Text variant="caption" tone="tertiary" align="center">
        {dirty
          ? "Vos modifications seront enregistrées avant l'ouverture de l'exemple."
          : "Document fictif, sans valeur, généré à la demande."}
      </Text>
    </View>
  );

  return (
    <Card padding={isWide ? 22 : 18} testID="branding">
      <View style={{ flexDirection: isWide ? "row" : "column", gap: isWide ? 28 : 24 }}>
        {controls}
        {preview}
      </View>
      <ConfirmSheet
        visible={confirmRemove}
        title="Retirer le logo ?"
        message="Vos prochains devis, factures et emails afficheront le nom de l'entreprise à la place. Les documents déjà envoyés ne changent pas."
        confirmLabel="Retirer le logo"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setConfirmRemove(false)}
      />
    </Card>
  );
}
