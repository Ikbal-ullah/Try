// The generation state machine, as a pure function so it is easy to test.
//
//   idle ──start──▶ loading ──success──▶ success
//                     │  ▲                  │
//                  failure└──── start ──────┘
//                     ▼
//                   error ──start (retry)──▶ loading
//
// `result` is kept while loading and on error, so cancelling or dismissing an
// error can put the previous study set back instead of throwing it away.

export const initialState = {
  status: 'idle', // 'idle' | 'loading' | 'success' | 'error'
  result: null, // { id, sourceText, studySet, warnings } - the last GOOD result
  error: null, // { code, message }
  isSlow: false, // loading has gone on long enough to tell the user
};

export function generationReducer(state, action) {
  switch (action.type) {
    case 'start':
      return { ...state, status: 'loading', error: null, isSlow: false };
    case 'slow':
      return state.status === 'loading' ? { ...state, isSlow: true } : state;
    case 'success':
      return { status: 'success', result: action.result, error: null, isSlow: false };
    case 'failure':
      return { ...state, status: 'error', error: action.error, isSlow: false };
    case 'cancel': // also used to dismiss an error
      return { ...state, status: state.result ? 'success' : 'idle', error: null, isSlow: false };
    case 'load': // open a saved session
      return { status: 'success', result: action.result, error: null, isSlow: false };
    case 'clear':
      return initialState;
    default:
      return state;
  }
}
