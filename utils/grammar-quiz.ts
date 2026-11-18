export type GrammarQuizState = {
  questionIndex: number;
  selectedIndex: number | null;
  correctCount: number;
  finished: boolean;
};

export function startGrammarQuiz(): GrammarQuizState {
  return { questionIndex: 0, selectedIndex: null, correctCount: 0, finished: false };
}

export function selectGrammarAnswer(
  state: GrammarQuizState,
  optionIndex: number,
  correctIndex: number,
  optionCount: number,
): GrammarQuizState {
  if (state.finished || state.selectedIndex !== null || !Number.isInteger(optionIndex)
    || optionIndex < 0 || optionIndex >= optionCount) return state;
  return {
    ...state,
    selectedIndex: optionIndex,
    correctCount: state.correctCount + Number(optionIndex === correctIndex),
  };
}

export function nextGrammarQuestion(state: GrammarQuizState, questionCount: number): GrammarQuizState {
  if (state.finished || state.selectedIndex === null || questionCount < 1) return state;
  if (state.questionIndex >= questionCount - 1) return { ...state, finished: true };
  return { ...state, questionIndex: state.questionIndex + 1, selectedIndex: null };
}
