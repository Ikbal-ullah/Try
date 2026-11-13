// Quiz state as a pure reducer. A "round" asks every question in `queue`;
// when it ends, the questions answered wrong can become the next round's queue.

export function startQuiz(questionIds) {
  return {
    round: 1,
    queue: questionIds, // ids to ask this round, in order
    position: 0, // which one we are on
    selected: null, // option index picked for the current question, or null
    wrongIds: [], // ids answered wrong this round
    phase: 'asking', // 'asking' | 'results'
  };
}

export function quizReducer(state, action) {
  switch (action.type) {
    case 'answer': {
      if (state.phase !== 'asking' || state.selected !== null) return state; // one answer per question
      const currentId = state.queue[state.position];
      return {
        ...state,
        selected: action.optionIndex,
        wrongIds: action.isCorrect ? state.wrongIds : [...state.wrongIds, currentId],
      };
    }
    case 'next': {
      if (state.selected === null) return state; // must answer first
      const isLastQuestion = state.position === state.queue.length - 1;
      return isLastQuestion
        ? { ...state, phase: 'results' }
        : { ...state, position: state.position + 1, selected: null };
    }
    case 'retest-wrong': {
      if (state.phase !== 'results' || state.wrongIds.length === 0) return state;
      return { ...startQuiz(state.wrongIds), round: state.round + 1 };
    }
    case 'restart':
      return startQuiz(action.questionIds);
    default:
      return state;
  }
}
