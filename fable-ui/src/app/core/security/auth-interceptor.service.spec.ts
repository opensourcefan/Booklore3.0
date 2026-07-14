import {describe, expect, it} from 'vitest';
import {API_CONFIG} from '../config/api-config';
import {isPublicAuthEndpoint} from './auth-interceptor.service';

describe('isPublicAuthEndpoint', () => {
  const auth = `${API_CONFIG.BASE_URL}/api/v1/auth`;

  it('skips bearer for login/refresh/logout/oidc', () => {
    expect(isPublicAuthEndpoint(`${auth}/login`)).toBe(true);
    expect(isPublicAuthEndpoint(`${auth}/refresh`)).toBe(true);
    expect(isPublicAuthEndpoint(`${auth}/logout`)).toBe(true);
    expect(isPublicAuthEndpoint(`${auth}/remote`)).toBe(true);
    expect(isPublicAuthEndpoint(`${auth}/oidc/state`)).toBe(true);
  });

  it('attaches bearer for admin register', () => {
    expect(isPublicAuthEndpoint(`${auth}/register`)).toBe(false);
  });
});
