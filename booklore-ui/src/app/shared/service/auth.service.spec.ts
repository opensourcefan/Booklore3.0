import {TestBed} from '@angular/core/testing';
import {HttpClient} from '@angular/common/http';
import {Router} from '@angular/router';
import {of} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {AuthService} from './auth.service';
import {PostLoginInitializerService} from '../../core/services/post-login-initializer.service';

describe('AuthService token storage', () => {
  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        {provide: HttpClient, useValue: {post: vi.fn(), get: vi.fn()}},
        {provide: Router, useValue: {navigate: vi.fn().mockResolvedValue(true)}},
        {provide: PostLoginInitializerService, useValue: {initialize: vi.fn().mockReturnValue(of(void 0))}}
      ]
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('stores and exposes token expiry and default-password metadata', () => {
    const service = TestBed.inject(AuthService);

    service.saveInternalTokens({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expires: 123456,
      isDefaultPassword: true
    });

    expect(service.getInternalAccessToken()).toBe('access-token');
    expect(service.getInternalRefreshToken()).toBe('refresh-token');
    expect(service.getInternalAccessTokenExpiry()).toBe(123456);
    expect(service.getInternalDefaultPassword()).toBe(true);
  });

  it('clears stale persisted auth state during startup hydration', () => {
    localStorage.setItem('accessToken_Internal', 'stale-access-token');
    localStorage.setItem('refreshToken_Internal', 'stale-refresh-token');

    const service = TestBed.inject(AuthService);

    expect(service.getInternalAccessToken()).toBeNull();
    expect(service.getInternalRefreshToken()).toBeNull();
    expect(service.getInternalAccessTokenExpiry()).toBeNull();
    expect(service.getInternalDefaultPassword()).toBeNull();
  });

  it('reports when a stored internal access token is still valid', () => {
    const service = TestBed.inject(AuthService);

    service.saveInternalTokens({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expires: Date.now() + 60_000,
      isDefaultPassword: false
    });

    expect(service.hasValidInternalAccessToken()).toBe(true);
  });
});