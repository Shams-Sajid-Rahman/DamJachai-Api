/**
 * An error with an HTTP status code that is safe to show to the client.
 * `code` is an optional machine-readable string, e.g. "TOKEN_EXPIRED".
 */
export class ApiError extends Error {
  constructor(statusCode, message, { details, code } = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.code = code;
  }

  static badRequest(message = 'Bad request', details) {
    return new ApiError(400, message, { details });
  }

  static unauthorized(message = 'Unauthorized', code) {
    return new ApiError(401, message, { code });
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Not found') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Conflict', details) {
    return new ApiError(409, message, { details });
  }
}
