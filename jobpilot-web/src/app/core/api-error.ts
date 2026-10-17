import { HttpErrorResponse } from '@angular/common/http';

interface ApiErrorBody {
  message?: string;
  errors?: { field: string; message: string }[];
}

function apiBody(err: unknown): ApiErrorBody | null {
  return err instanceof HttpErrorResponse && err.error && typeof err.error === 'object'
    ? (err.error as ApiErrorBody)
    : null;
}

// Turns an API error into one readable sentence for the UI
export function apiErrorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  if (
    err instanceof HttpErrorResponse &&
    (err.status === 0 || (err.status >= 500 && !apiBody(err)))
  ) {
    return 'Cannot reach the JobPilot API. Make sure the backend is running on port 5000.';
  }
  const body = apiBody(err);
  if (body?.errors?.length) return body.errors.map((e) => e.message).join(' ');
  return body?.message ?? fallback;
}

// Maps the API's validation errors to { fieldName: message } for showing under form fields
export function apiFieldErrors(err: unknown): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const e of apiBody(err)?.errors ?? []) {
    if (e.field && !errors[e.field]) errors[e.field] = e.message;
  }
  return errors;
}
