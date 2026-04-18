export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function getErrorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined;
}
