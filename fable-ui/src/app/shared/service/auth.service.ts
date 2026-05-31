import {inject, Injectable, Injector} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {BehaviorSubject, Observable, tap} from 'rxjs';
import {RxStompService} from '../websocket/rx-stomp.service';
import {API_CONFIG} from '../../core/config/api-config';
import {createRxStompConfig} from '../websocket/rx-stomp.config';
import {Router} from '@angular/router';
import {PostLoginInitializerService} from '../../core/services/post-login-initializer.service';
import {AuthTokenResponse} from '../model/auth-token-response.model';

const ACCESS_TOKEN_STORAGE_KEY = 'accessToken_Internal';
const REFRESH_TOKEN_STORAGE_KEY = 'refreshToken_Internal';
const ACCESS_TOKEN_EXPIRY_STORAGE_KEY = 'accessToken_Internal_Expires';
const DEFAULT_PASSWORD_STORAGE_KEY = 'isDefaultPassword_Internal';

@Injectable({
  providedIn: 'root',
})
export class AuthService {

  private apiUrl = `${API_CONFIG.BASE_URL}/api/v1/auth`;
  private rxStompService?: RxStompService;
  private postLoginInitialized = false;

  private http = inject(HttpClient);
  private injector = inject(Injector);
  private router = inject(Router);
  private postLoginInitializer = inject(PostLoginInitializerService);

  public tokenSubject = new BehaviorSubject<string | null>(this.resolveInitialInternalAccessToken());
  public token$ = this.tokenSubject.asObservable();

  /**
   * Token-refresh state used by the auth interceptor.
   * Keeping these as injectable service instance fields (rather than module-level
   * variables in the interceptor file) prevents test pollution and makes state
   * ownership explicit (L3 — OWASP A07 code-quality fix).
   */
  public isRefreshing = false;
  public readonly refreshTokenSubject = new BehaviorSubject<string | null>(null);

  internalLogin(credentials: { username: string; password: string }): Observable<AuthTokenResponse> {
    return this.http.post<AuthTokenResponse>(`${this.apiUrl}/login`, credentials).pipe(
      tap((response) => {
        if (response.accessToken && response.refreshToken) {
          this.saveInternalTokens(response);
          this.initializeWebSocketConnection();
          this.handleSuccessfulAuth();
        }
      })
    );
  }

  internalRefreshToken(): Observable<AuthTokenResponse> {
    const refreshToken = this.getInternalRefreshToken();
    return this.http.post<AuthTokenResponse>(`${this.apiUrl}/refresh`, {refreshToken}).pipe(
      tap((response) => {
        if (response.accessToken && response.refreshToken) {
          this.saveInternalTokens(response);
        }
      })
    );
  }

  remoteLogin(): Observable<AuthTokenResponse> {
    return this.http.get<AuthTokenResponse>(`${this.apiUrl}/remote`).pipe(
      tap((response) => {
        if (response.accessToken && response.refreshToken) {
          this.saveInternalTokens(response);
          this.initializeWebSocketConnection();
          this.handleSuccessfulAuth();
        }
      })
    );
  }

  saveInternalTokens(tokenResponse: AuthTokenResponse): void {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, tokenResponse.accessToken);
    localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, tokenResponse.refreshToken);
    localStorage.setItem(ACCESS_TOKEN_EXPIRY_STORAGE_KEY, tokenResponse.expires.toString());
    sessionStorage.setItem(DEFAULT_PASSWORD_STORAGE_KEY, String(tokenResponse.isDefaultPassword));
    this.tokenSubject.next(tokenResponse.accessToken);
  }

  getInternalAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  }

  getInternalRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  }

  getInternalAccessTokenExpiry(): number | null {
    return this.readStoredNumber(ACCESS_TOKEN_EXPIRY_STORAGE_KEY);
  }

  getInternalDefaultPassword(): boolean | null {
    const val = sessionStorage.getItem(DEFAULT_PASSWORD_STORAGE_KEY);
    return val !== null ? val === 'true' : null;
  }

  hasValidInternalAccessToken(): boolean {
    const token = this.getInternalAccessToken();
    const expires = this.getInternalAccessTokenExpiry();
    return !!token && expires !== null && expires > Date.now();
  }

  logout(): void {
    const refreshToken = this.getInternalRefreshToken();
    this.http.post<{ logoutUrl: string | null }>(`${this.apiUrl}/logout`, {refreshToken}).subscribe({
      next: (response) => {
        if (response.logoutUrl) {
          window.location.href = response.logoutUrl;
        } else {
          this.clearSession();
          this.router.navigate(['/login']).then(() => window.location.reload());
        }
      },
      error: () => {
        this.clearSession();
        this.router.navigate(['/login']).then(() => window.location.reload());
      }
    });
  }

  forceLogout(reason: string): void {
    this.clearSession();
    this.router.navigate(['/login'], {queryParams: {reason}});
  }

  clearSessionOnLoginPage(): void {
    this.clearSession();
  }

  private clearSession(): void {
    this.clearStoredSessionData();
    this.tokenSubject.next(null);
    this.postLoginInitialized = false;
    this.getRxStompService().deactivate();
  }

  getRxStompService(): RxStompService {
    if (!this.rxStompService) {
      this.rxStompService = this.injector.get(RxStompService);
    }
    return this.rxStompService;
  }

  initializeWebSocketConnection(): void {
    const token = this.getInternalAccessToken();
    if (!token) return;

    const stompService = this.getRxStompService();
    const config = createRxStompConfig(this);
    stompService.updateConfig(config);
    stompService.activate();

    if (!this.postLoginInitialized) {
      this.handleSuccessfulAuth();
    }
  }

  private handleSuccessfulAuth() {
    if (this.postLoginInitialized) return;
    this.postLoginInitialized = true;
    this.postLoginInitializer.initialize().subscribe({
      error: (err) => console.error('AuthService: Post-login initialization failed:', err)
    });
  }

  private resolveInitialInternalAccessToken(): string | null {
    const accessToken = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
    if (!accessToken) {
      return null;
    }

    const expires = this.readStoredNumber(ACCESS_TOKEN_EXPIRY_STORAGE_KEY);
    const isDefaultPassword = this.getInternalDefaultPassword();
    if (expires === null || isDefaultPassword === null || expires <= Date.now()) {
      this.clearStoredSessionData();
      return null;
    }

    return accessToken;
  }

  private clearStoredSessionData(): void {
    localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
    localStorage.removeItem(ACCESS_TOKEN_EXPIRY_STORAGE_KEY);
    sessionStorage.removeItem(DEFAULT_PASSWORD_STORAGE_KEY);
  }

  private readStoredNumber(key: string): number | null {
    const value = localStorage.getItem(key);
    if (value === null) {
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private readStoredBoolean(key: string): boolean | null {
    const value = localStorage.getItem(key);
    if (value === 'true') {
      return true;
    }
    if (value === 'false') {
      return false;
    }
    return null;
  }
}

export function websocketInitializer(authService: AuthService): () => void {
  return () => authService.initializeWebSocketConnection();
}
