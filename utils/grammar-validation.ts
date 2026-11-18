import { GRAMMAR_LESSONS } from '../constants/grammar';

export function validateGrammarCatalog(): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const lesson of GRAMMAR_LESSONS) {
    if (ids.has(lesson.id)) errors.push(`${lesson.id}: tekrar eden kimlik`);
    ids.add(lesson.id);
    if (!lesson.title.trim() || !lesson.rule.trim() || !lesson.tip.trim()) errors.push(`${lesson.id}: eksik ders metni`);
    if (lesson.examples.length < 3) errors.push(`${lesson.id}: en az 3 örnek gerekli`);
    if (lesson.questions.length !== 4) errors.push(`${lesson.id}: 4 soru gerekli`);
    for (const example of lesson.examples) {
      if (!example.german.trim() || !example.turkish.trim()) errors.push(`${lesson.id}: eksik örnek çevirisi`);
    }
    for (const [index, question] of lesson.questions.entries()) {
      if (!question.prompt.trim() || !question.explanation.trim()) errors.push(`${lesson.id}/${index}: eksik soru açıklaması`);
      if (question.correctIndex < 0 || question.correctIndex >= question.options.length) errors.push(`${lesson.id}/${index}: geçersiz doğru seçenek`);
      if (question.options.some(option => !option.trim()) || new Set(question.options).size !== question.options.length) {
        errors.push(`${lesson.id}/${index}: boş veya yinelenen seçenek`);
      }
    }
  }
  return errors;
}
