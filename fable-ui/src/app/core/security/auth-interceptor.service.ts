import {HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest} from '@angular/common/http';
import {inject} from '@angular/core';
import {catchError, filter, switchMap, take} from 'rxjs/operators';
import {Observable, throwError, timer} from 'rxjs';
import {AuthService} from '../../shared/service/auth.service';
import {API_CONFIG} from '../config/api-config';

const AUTH_URL_PREFIX = `${API_CONFIG.BASE_URL}/api/v1/auth/`;

/** Auth endpoints must not trigger the 401→refresh loop (refresh/logout especially). */
function isAuthEndpoint(url: string): boolean {
  return url.startsWith(AUTH_URL_PREFIX);
}

export const AuthInterceptorService: HttpInterceptorFn = (req, next: HttpHandlerFn) => {
  const authService = inject(AuthService);

  const token = authService.getInternalAccessToken();
  const isApiRequest = req.url.startsWith(`${API_CONFIG.BASE_URL}/api/`);
  // Never attach a (possibly expired) bearer to refresh/logout — those use the refresh token body
  // and must remain reachable after the 10-hour access token expires.
  const attachBearer = !!token && isApiRequest && !isAuthEndpoint(req.url);

  const authReq = attachBearer ? req.clone({setHeaders: {Authorization: `Bearer ${token}`}}) : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && isApiRequest && !isAuthEndpoint(req.url)) {
        return handle401Error(authService, authReq, next);
      }
      return throwError(() => error);
    })
  );
};

function handle401Error(authService: AuthService, request: HttpRequest<unknown>, next: HttpHandlerFn): Observable<HttpEvent<unknown>> {
  if (!authService.isRefreshing) {
    authService.isRefreshing = true;
    authService.refreshTokenSubject.next(null);

    return authService.internalRefreshToken().pipe(
      switchMap(response => {
        authService.isRefreshing = false;
        const {accessToken, refreshToken} = response;
        if (accessToken && refreshToken) {
          authService.saveInternalTokens(response);
          authService.refreshTokenSubject.next(accessToken);
        }
        return next(request.clone({
          setHeaders: {Authorization: `Bearer ${accessToken}`}
        }));
      }),
      catchError(err => {
        authService.isRefreshing = false;
        authService.refreshTokenSubject.next(null);
        // Soft session end — do NOT call logout() (that posts with a dead refresh token,
        // re-enters this interceptor, and for OIDC can hard-navigate to a broken end_session URL).
        authService.forceLogout('session_expired');
        return throwError(() => err);
      })
    );
  }

  // Wait for the in-flight refresh to finish, then retry or fail.
  return timer(0, 50).pipe(
    filter(() => !authService.isRefreshing),
    take(1),
    switchMap(() => {
      const accessToken = authService.getInternalAccessToken();
      if (!accessToken || !authService.hasValidInternalAccessToken()) {
        return throwError(() => new Error('Session expired'));
      }
      return next(request.clone({
        setHeaders: {Authorization: `Bearer ${accessToken}`}
      }));
    })
  );
}
