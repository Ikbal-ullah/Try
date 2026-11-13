// One logging function for the whole server.
//
// In production each line is a JSON object, which log services (CloudWatch,
// Datadog, ...) can filter and count: e.g. "all events where code=TIMEOUT".
// In development it prints a readable line instead. Tests stay quiet.
//
// Rule: never pass the user's study text or the API key to this function.

export function log(level, event, fields = {}) {
  const env = process.env.NODE_ENV;
  if (env === 'test') return;
  if (env === 'production') {
    console[level](JSON.stringify({ time: new Date().toISOString(), level, event, ...fields }));
    return;
  }
  const details = Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  console[level](`[${event}] ${details}`);
}
