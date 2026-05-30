import {TestBed} from '@angular/core/testing';
import {Router} from '@angular/router';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {AuthGuard} from './auth.guard';
import {AuthService} from '../../shared/service/auth.service';

describe('AuthGuard', () => {
  let authServiceMock: {
    getInternalAccessToken: ReturnType<typeof vi.fn>;
    getInternalAccessTokenExpiry: ReturnType<typeof vi.fn>;
    getInternalDefaultPassword: ReturnType<typeof vi.fn>;
    clearSessionOnLoginPage: ReturnType<typeof vi.fn>;
  };
  let createUrlTree: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createUrlTree = vi.fn(commands => ({commands}));
    authServiceMock = {
      getInternalAccessToken: vi.fn(),
      getInternalAccessTokenExpiry: vi.fn(),
      getInternalDefaultPassword: vi.fn(),
      clearSessionOnLoginPage: vi.fn()
    };

    TestBed.configureTestingModule({
      providers: [
        {provide: AuthService, useValue: authServiceMock},
        {provide: Router, useValue: {createUrlTree}}
      ]
    });
  });

  it('allows navigation when the stored token metadata is valid', () => {
    authServiceMock.getInternalAccessToken.mockReturnValue('access-token');
    authServiceMock.getInternalAccessTokenExpiry.mockReturnValue(Date.now() + 60_000);
    authServiceMock.getInternalDefaultPassword.mockReturnValue(false);

    const result = TestBed.runInInjectionContext(() => AuthGuard({} as never, {} as never));

    expect(result).toBe(true);
    expect(authServiceMock.clearSessionOnLoginPage).not.toHaveBeenCalled();
  });

  it('redirects to change-password when the stored session flags a default password', () => {
    authServiceMock.getInternalAccessToken.mockReturnValue('access-token');
    authServiceMock.getInternalAccessTokenExpiry.mockReturnValue(Date.now() + 60_000);
    authServiceMock.getInternalDefaultPassword.mockReturnValue(true);

    const result = TestBed.runInInjectionContext(() => AuthGuard({} as never, {} as never));

    expect(result).toEqual({commands: ['/change-password']});
    expect(createUrlTree).toHaveBeenCalledWith(['/change-password']);
  });

  it('clears the session and redirects to login when auth metadata is missing', () => {
    authServiceMock.getInternalAccessToken.mockReturnValue('access-token');
    authServiceMock.getInternalAccessTokenExpiry.mockReturnValue(null);
    authServiceMock.getInternalDefaultPassword.mockReturnValue(null);

    const result = TestBed.runInInjectionContext(() => AuthGuard({} as never, {} as never));

    expect(result).toEqual({commands: ['/login']});
    expect(authServiceMock.clearSessionOnLoginPage).toHaveBeenCalledTimes(1);
  });

  it('redirects to login when there is no stored access token', () => {
    authServiceMock.getInternalAccessToken.mockReturnValue(null);

    const result = TestBed.runInInjectionContext(() => AuthGuard({} as never, {} as never));

    expect(result).toEqual({commands: ['/login']});
    expect(createUrlTree).toHaveBeenCalledWith(['/login']);
  });
});