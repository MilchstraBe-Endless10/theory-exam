export class HttpError extends Error {
  constructor(public readonly statusCode: number, public readonly code: string, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export function badRequest(message = '请求参数无效', code = 'INVALID_REQUEST'): HttpError {
  return new HttpError(400, code, message);
}
