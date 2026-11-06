export class ApiError extends Error {
  constructor(
    public readonly status: 400 | 401 | 404 | 409 | 422 | 429 | 502,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}
