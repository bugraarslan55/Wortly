import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useUserStore } from '../store';
import { Spacing } from '../constants/theme';
import { makeStyles, useColors } from '../hooks/use-theme';
import { PROFILE_NAME_MAX_LENGTH, validateProfileName } from '../utils/profile-name';
import { AppIcon } from './app-icon';
import { Card, FormField, PrimaryButton, SecondaryButton, TextField } from './ui';

/** Görünen adı düzenler. Kayıt ve senkron, mevcut profil deposundaki updateProfile üzerinden yapılır. */
export function ProfileEditCard() {
  const styles = useStyles();
  const colors = useColors();
  const profile = useUserStore(state => state.profile);
  const updateProfile = useUserStore(state => state.updateProfile);

  const currentName = profile?.name?.trim() ?? '';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const startEditing = () => {
    setDraft(currentName);
    setError(undefined);
    setEditing(true);
  };

  const cancel = () => {
    if (saving) return;
    setEditing(false);
    setError(undefined);
  };

  const save = async () => {
    if (saving) return;
    const result = validateProfileName(draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.name === currentName) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await updateProfile({ name: result.name });
      setEditing(false);
      setError(undefined);
    } catch {
      setError('Ad kaydedilemedi. Lütfen tekrar dene.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={styles.card}>
      {editing ? (
        <>
          <FormField label="Görünen ad" error={error}>
            <TextField
              value={draft}
              onChangeText={(text) => { setDraft(text); if (error) setError(undefined); }}
              placeholder="örn: Ahmet"
              maxLength={PROFILE_NAME_MAX_LENGTH}
              autoFocus
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => { void save(); }}
              invalid={!!error}
              editable={!saving}
              accessibilityLabel="Görünen ad"
            />
          </FormField>
          <View style={styles.actions}>
            <SecondaryButton label="İptal" onPress={cancel} disabled={saving} style={styles.action} />
            <PrimaryButton label="Kaydet" onPress={() => { void save(); }} loading={saving} style={styles.action} />
          </View>
        </>
      ) : (
        <TouchableOpacity
          style={styles.row}
          onPress={startEditing}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Görünen ad: ${currentName || 'belirlenmemiş'}`}
          accessibilityHint="Görünen adı düzenler"
        >
          <View style={styles.rowText}>
            <Text style={styles.label}>Görünen ad</Text>
            <Text style={styles.value} numberOfLines={1}>{currentName || 'Belirlenmemiş'}</Text>
          </View>
          <Text style={styles.editText}>Düzenle</Text>
          <AppIcon name="chevron.right" size={14} color={colors.outline} />
        </TouchableOpacity>
      )}
    </Card>
  );
}

const useStyles = makeStyles(Colors => StyleSheet.create({
  card: { gap: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: Spacing.touchTargetMin },
  rowText: { flex: 1, gap: 2 },
  label: { fontSize: 12, color: Colors.onSurfaceVariant },
  value: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  editText: { fontSize: 14, fontWeight: '700', color: Colors.secondary },
  actions: { flexDirection: 'row', gap: Spacing.sm },
  action: { flex: 1 },
}));
