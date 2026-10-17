import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

const PUBLIC_URLS = ['/api/auth/login', '/api/auth/register'];

// Adds the Bearer token to API calls and sends the user back to login when it is rejected
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token();
  const needsToken = token && req.url.startsWith('/api/') && !PUBLIC_URLS.includes(req.url);

  const request = needsToken
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(request).pipe(
    catchError((err: unknown) => {
      if (needsToken && err instanceof HttpErrorResponse && err.status === 401) {
        auth.logout('expired');
      }
      return throwError(() => err);
    }),
  );
};
