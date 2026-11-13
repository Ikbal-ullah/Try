// Every failure the API can report, with the HTTP status we send for it.
// The browser only relies on `code`; the status is there to be a good HTTP citizen.

export class AppError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

const STATUS_BY_CODE = {
  EMPTY_INPUT: 400,
  INPUT_TOO_LONG: 400,
  BAD_REQUEST: 400,
  EMPTY_RESULT: 422,
  RATE_LIMITED: 429,
  CONFIG: 500,
  OVERLOADED: 503,
  MALFORMED_JSON: 502,
  WRONG_SHAPE: 502,
  PROVIDER_ERROR: 502,
  TIMEOUT: 504,
};

export function statusFor(code) {
  return STATUS_BY_CODE[code] ?? 500;
}
