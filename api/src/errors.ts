export class ApiError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409 | 422 | 502,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}
