// What the user sees for each error code. The server's message is a fallback;
// the title and hint here are written for someone who is trying to study,
// not someone debugging an API.

const COPY = {
  NETWORK: { title: "Can't reach the server", hint: 'Check your internet connection, then try again.' },
  BAD_RESPONSE: { title: 'The server sent something unexpected', hint: 'If you are running this locally, make sure the API server is running.' },
  TIMEOUT: { title: 'That took too long', hint: 'The AI did not answer in time. Try again, or use shorter notes.' },
  RATE_LIMITED: { title: 'Too many requests', hint: 'The AI provider asked us to slow down. Wait a minute and try again.' },
  TOO_MANY_REQUESTS: { title: 'Slow down a little', hint: 'You are generating study sets very quickly. Wait a minute and try again.' },
  SERVER_BUSY: { title: 'Lots of people are studying right now', hint: 'The app is at capacity. Try again in a moment.' },
  OVERLOADED: { title: 'The AI is busy right now', hint: 'The model is overloaded. This usually clears up within a minute.' },
  MALFORMED_JSON: { title: "The AI's answer was garbled", hint: 'We asked twice and could not read either answer. This is usually a one-off, so try again.' },
  WRONG_SHAPE: { title: "The AI's answer was not usable", hint: 'We asked twice and did not get flashcards or questions back. Try again, or reword your notes.' },
  EMPTY_RESULT: { title: 'Nothing to study in that', hint: 'The AI could not find study material in your text. Add a few sentences of notes or a more specific topic.', retryable: false },
  EMPTY_INPUT: { title: 'Nothing to work with yet', hint: 'Paste some notes or type a topic first.', retryable: false },
  INPUT_TOO_LONG: { title: 'That is a lot of notes', hint: 'Shorten your text and try again.', retryable: false },
  CONFIG: { title: 'The server is not set up yet', hint: 'The API key is missing. See the README: copy .env.example to .env and add a key.', retryable: false },
  PROVIDER_ERROR: { title: 'The AI service had a problem', hint: 'This is on the AI provider side. Try again in a moment.' },
};

const FALLBACK = { title: 'Something went wrong', hint: 'Please try again.' };

export function describeError(error) {
  const copy = COPY[error?.code] ?? { ...FALLBACK, hint: error?.message || FALLBACK.hint };
  return { retryable: true, ...copy };
}
