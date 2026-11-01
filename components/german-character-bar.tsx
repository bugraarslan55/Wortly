import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BorderRadius, Colors, Spacing } from '../constants/theme';

const GERMAN_CHARACTERS = ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'];

/** Tek satırda, ekrana yayılan kompakt Almanca karakter tuşları (kaydırma gerekmez). */
export function GermanCharacterBar({ onSelect }: { onSelect: (character: string) => void }) {
  return (
    <View style={styles.row} accessibilityLabel="Almanca karakter ekle">
      {GERMAN_CHARACTERS.map((character) => (
        <TouchableOpacity
          key={character}
          style={styles.button}
          onPress={() => onSelect(character)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${character} karakterini ekle`}
        >
          <Text style={styles.buttonText} maxFontSizeMultiplier={1.2}>{character}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // Dar ekranda taşmak yerine ikinci satıra sarılır; her tuş en az 40x44 px.
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  button: {
    flexGrow: 1,
    flexBasis: 40,
    minWidth: 40,
    height: Spacing.touchTargetMin,
    borderRadius: BorderRadius.md,
    borderCurve: 'continuous',
    backgroundColor: Colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 17, fontWeight: '600', color: Colors.primary },
});
