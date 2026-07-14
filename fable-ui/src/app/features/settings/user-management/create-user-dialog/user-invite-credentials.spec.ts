import {describe, expect, it} from 'vitest';
import {buildUserInviteCredentialsPack, buildUserInviteLoginUrl} from './user-invite-credentials';

describe('user-invite-credentials', () => {
  it('builds a login URL that targets /login with invite reason', () => {
    expect(buildUserInviteLoginUrl('https://fable.example.com')).toBe(
      'https://fable.example.com/login?reason=invite'
    );
    expect(buildUserInviteLoginUrl('https://fable.example.com/')).toBe(
      'https://fable.example.com/login?reason=invite'
    );
  });

  it('packs link, username, and password for one-click copy', () => {
    const pack = buildUserInviteCredentialsPack({
      loginUrl: 'https://fable.example.com/login?reason=invite',
      username: 'jamie',
      password: 'TempPass123!',
    });
    expect(pack).toContain('Login: https://fable.example.com/login?reason=invite');
    expect(pack).toContain('Username: jamie');
    expect(pack).toContain('Password: TempPass123!');
    expect(pack).toContain('Open the Login link');
  });
});
