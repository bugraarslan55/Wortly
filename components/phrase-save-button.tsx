import React from 'react';
import { StyleProp, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { BorderRadius } from '../constants/theme';
import { makeStyles, useColors } from '../hooks/use-theme';
import { saveLabel, type PhraseInput } from '../utils/phrasebook';
import { AppIcon } from './app-icon';
import { usePhrasebook } from './use-phrasebook';

/**
 * "İfade Defterim"e kaydet/kaldır düğmesi. Defter bu kullanıcı için hazır değilse (yükleniyor, başka hesabın kaydı,
 * depo okunamadı) hiç görünmez; böylece yanlış hesaba ya da bozuk depoya yazılamaz.
 */
export function PhraseSaveButton({ phrase, style }: { phrase: PhraseInput; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  const colors = useColors();
  const { ready, isPhraseSaved, toggle } = usePhrasebook();
  if (!ready) return null;
  const saved = isPhraseSaved(phrase.german);
  return (
    <TouchableOpacity
      style={[styles.button, saved && styles.buttonSaved, style]}
      onPress={() => { void toggle(phrase); }}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={saveLabel(saved, phrase.german)}
      accessibilityState={{ selected: saved }}
    >
      <AppIcon name={saved ? 'bookmark.fill' : 'bookmark'} size={18} color={colors.primary} />
    </TouchableOpacity>
  );
}

const useStyles = makeStyles(Colors => StyleSheet.create({
  button: {
    width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: BorderRadius.lg,
    backgroundColor: Colors.surfaceContainer, borderWidth: 1.5, borderColor: 'transparent',
  },
  buttonSaved: { backgroundColor: Colors.secondaryContainer, borderColor: Colors.golden },
}));
