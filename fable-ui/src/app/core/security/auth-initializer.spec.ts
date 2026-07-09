import {beforeEach, describe, expect, it, vi} from 'vitest';
import {TestBed} from '@angular/core/testing';
import {initializeAuthFactory} from './auth-initializer';
import {AuthInitializationService} from './auth-initialization-service';
import {AuthService} from '../../shared/service/auth.service';
import {AppSettingsService, PublicAppSettings} from '../../shared/service/app-settings.service';
import {BehaviorSubject, Observable, of} from 'rxjs';

const defaultPublicSettings: PublicAppSettings = {
  oidcEnabled: false,
  remoteAuthEnabled: false,
  aiPanelDetectionEnabled: false,
  oidcProviderDetails: null!,
  oidcForceOnlyMode: false,
};

describe('initializeAuthFactory', () => {
  let authInitService: AuthInitializationService;
  let publicSettingsSubject: BehaviorSubject<PublicAppSettings | null>;

  beforeEach(() => {
    publicSettingsSubject = new BehaviorSubject<PublicAppSettings | null>(null);

    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthService,
          useValue: {
            tokenSubject: {next: vi.fn()},
            hasValidInternalAccessToken: vi.fn().mockReturnValue(false),
            getInternalRefreshToken: vi.fn().mockReturnValue(null),
            internalRefreshToken: vi.fn(),
            clearSessionOnLoginPage: vi.fn(),
            initializeWebSocketConnection: vi.fn()
          }
        },
        {provide: AppSettingsService, useValue: {publicAppSettings$: publicSettingsSubject.asObservable()}},
        AuthInitializationService,
      ]
    });

    authInitService = TestBed.inject(AuthInitializationService);
  });

  it('should proceed with auth initialization when navigator.onLine is false', async () => {
    const markSpy = vi.spyOn(authInitService, 'markAsInitialized');

    Object.defineProperty(navigator, 'onLine', {value: false, configurable: true});

    const factory = TestBed.runInInjectionContext(() => initializeAuthFactory());
    const initPromise = TestBed.runInInjectionContext(() => factory());

    publicSettingsSubject.next(defaultPublicSettings);

    await initPromise;

    expect(markSpy).toHaveBeenCalled();

    Object.defineProperty(navigator, 'onLine', {value: true, configurable: true});
  });

  it('should initialize normally when navigator.onLine is true', async () => {
    const markSpy = vi.spyOn(authInitService, 'markAsInitialized');

    Object.defineProperty(navigator, 'onLine', {value: true, configurable: true});

    const factory = TestBed.runInInjectionContext(() => initializeAuthFactory());
    const initPromise = TestBed.runInInjectionContext(() => factory());

    publicSettingsSubject.next(defaultPublicSettings);

    await initPromise;

    expect(markSpy).toHaveBeenCalled();
  });

  it('should attempt to refresh token on startup if access token is invalid but refresh token is present', async () => {
    const authService = TestBed.inject(AuthService);
    vi.spyOn(authService, 'hasValidInternalAccessToken').mockReturnValue(false);
    vi.spyOn(authService, 'getInternalRefreshToken').mockReturnValue('dummy-refresh-token');
    const refreshSpy = vi.spyOn(authService, 'internalRefreshToken').mockReturnValue(of({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      expires: Date.now() + 3600000,
      isDefaultPassword: false
    }));
    const markSpy = vi.spyOn(authInitService, 'markAsInitialized');

    const factory = TestBed.runInInjectionContext(() => initializeAuthFactory());
    const initPromise = TestBed.runInInjectionContext(() => factory());

    publicSettingsSubject.next(defaultPublicSettings);

    await initPromise;

    expect(refreshSpy).toHaveBeenCalled();
    expect(markSpy).toHaveBeenCalled();
  });

  it('should clear session and proceed if token refresh fails on startup', async () => {
    const authService = TestBed.inject(AuthService);
    vi.spyOn(authService, 'hasValidInternalAccessToken').mockReturnValue(false);
    vi.spyOn(authService, 'getInternalRefreshToken').mockReturnValue('dummy-refresh-token');
    const refreshSpy = vi.spyOn(authService, 'internalRefreshToken').mockReturnValue(new Observable(subscriber => {
      subscriber.error('refresh error');
    }));
    const clearSpy = vi.spyOn(authService, 'clearSessionOnLoginPage');
    const markSpy = vi.spyOn(authInitService, 'markAsInitialized');

    const factory = TestBed.runInInjectionContext(() => initializeAuthFactory());
    const initPromise = TestBed.runInInjectionContext(() => factory());

    publicSettingsSubject.next(defaultPublicSettings);

    await initPromise;

    expect(refreshSpy).toHaveBeenCalled();
    expect(clearSpy).toHaveBeenCalled();
    expect(markSpy).toHaveBeenCalled();
  });
});
