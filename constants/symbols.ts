export const TOPIC_SYMBOLS: Record<string, string> = {
  'a1-sayilar': 'number',
  'a1-renkler': 'paintpalette.fill',
  'a1-aile': 'person.3.fill',
  'a1-yiyecekler': 'fork.knife',
  'a1-selamlama': 'hand.wave.fill',
  'a1-goethe': 'text.book.closed.fill',
  'a2-ev': 'house.fill',
  'a2-sehir': 'bus.fill',
  'a2-meslek': 'briefcase.fill',
  'goethe-a2': 'text.book.closed.fill',
};

export const topicSymbol = (topicId: string) =>
  TOPIC_SYMBOLS[topicId] ?? 'rectangle.stack.fill';

export const EXERCISE_SYMBOLS = {
  flashcard: 'rectangle.on.rectangle.angled',
  'dinle-sec': 'speaker.wave.2.fill',
  'dogru-yanlis': 'checkmark.circle.fill',
  yazma: 'pencil.line',
  cumle: 'text.quote',
} as const;
