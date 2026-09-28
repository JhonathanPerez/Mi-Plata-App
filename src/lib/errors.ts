/** Error de validación con mensaje pensado para mostrarse al usuario. */
export class ValidationError extends Error {
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof ValidationError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return 'Ocurrió un error inesperado. Inténtalo de nuevo.';
}
