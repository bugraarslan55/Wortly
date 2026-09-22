import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BorderRadius, Colors, Spacing } from '../constants/theme';

const GERMAN_CHARACTERS = ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'];

export function GermanCharacterBar({ onSelect }: { onSelect: (character: string) => void }) {
  return (
    <View style={styles.container}>
      <Text style={styles.hint}>Almanca karakter ekle</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={styles.row}
      >
        {GERMAN_CHARACTERS.map((character) => (
          <TouchableOpacity
            key={character}
            style={styles.button}
            onPress={() => onSelect(character)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${character} karakterini ekle`}
          >
            <Text style={styles.buttonText}>{character}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.xs },
  hint: { fontSize: 11, color: Colors.outline },
  row: { gap: Spacing.sm, paddingRight: Spacing.md },
  button: {
    width: Spacing.touchTargetMin,
    height: Spacing.touchTargetMin,
    borderRadius: BorderRadius.md,
    borderCurve: 'continuous',
    backgroundColor: Colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 17, fontWeight: '600', color: Colors.primary },
});
