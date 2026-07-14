export interface UserInviteCredentials {
  loginUrl: string;
  username: string;
  password: string;
}

/** Builds a single paste-friendly block for out-of-band credential handoff. */
export function buildUserInviteCredentialsPack(credentials: UserInviteCredentials): string {
  return [
    `Login: ${credentials.loginUrl}`,
    `Username: ${credentials.username}`,
    `Password: ${credentials.password}`,
    '',
    'Open the Login link (not the home page) so any previous session on that browser is cleared first.',
  ].join('\n');
}

/** Preferred invite URL — /login clears local session tokens on load. */
export function buildUserInviteLoginUrl(origin: string = window.location.origin): string {
  return `${origin.replace(/\/$/, '')}/login?reason=invite`;
}
