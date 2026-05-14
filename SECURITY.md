# Security Policy

## Supported Versions

Security support is tracked against the actively maintained branch line rather than a single patch tag.

| Version / branch | Supported |
| --- | --- |
| develop | Yes |

The current source on `develop` declares version `3.17.21` in both the API and UI build metadata.

## Reporting a Vulnerability

If you believe you have found a security vulnerability in this repository:

1. Do not open a public issue with exploit details.
2. Use GitHub private vulnerability reporting for this repository if that option is available.
3. If private reporting is not available, contact the maintainers through GitHub using the most private channel available.

This source tree does not currently declare a dedicated security email address, and it does not document a response SLA.

Please include as much of the following as possible:

- Affected version and deployment method
- Whether the issue affects local login, OIDC, remote auth / forward auth, OPDS, Komga, WebSocket, or media streaming
- Relevant environment settings such as `ALLOWED_ORIGINS`, `REMOTE_AUTH_ENABLED`, `FORCE_DISABLE_OIDC`, and `GEO_IP_ENABLED`
- Reproduction steps, impact, and any proof of concept
- Whether the issue is reachable with default settings or requires non-default configuration

## Security-Relevant Behavior in the Codebase

- Passwords are hashed with BCrypt.
- Main API routes under `/api/**` use stateless JWT authentication.
- OPDS and Komga routes use HTTP Basic authentication.
- KOReader and Kobo APIs use dedicated authentication filters.
- WebSocket authentication is enforced by an inbound JWT-based channel interceptor.
- OIDC login validates redirect URIs, issuer, audience, authorized party, expiration, issued-at time, nonce, and `at_hash` when present.
- OIDC back-channel logout support revokes stored refresh tokens and marks matching OIDC sessions as revoked.
- CSRF is disabled across the security filter chains because the application is built around stateless authentication flows.

## Deployment Hardening Notes

- The secure default for HTTP and WebSocket access is same-origin only when `ALLOWED_ORIGINS` is unset or empty.
- Setting `ALLOWED_ORIGINS=*` is explicitly treated as insecure by the codebase because it can allow credentialed cross-origin API access and cross-site WebSocket hijacking.
- `/api/v1/healthcheck` is intentionally unauthenticated so container health checks can succeed.
- `/api/v1/auth/**`, `/api/v1/setup/**`, `/api/v1/public-settings`, the `/ws` handshake, and OPDS search feed endpoints are intentionally reachable before normal application authentication because they handle login, setup, public configuration, discovery, or WebSocket establishment.
- Media, custom font, EPUB, and audiobook streaming routes are marked permit-all at the Spring authorization layer but are guarded by dedicated JWT filters.
- Remote auth / forward auth makes the application trust identity headers supplied by the reverse proxy. Do not enable it unless every request is forced through your authenticated proxy.
- GeoIP audit enrichment is disabled by default. Enabling it sends visitor IP addresses to `ip-api.com` over HTTPS for country-code lookup.

## Additional Hardening Already Implemented

- External image fetching only allows HTTP and HTTPS, follows a bounded number of redirects, and blocks loopback, link-local, site-local, any-local, unique-local IPv6, and IPv4-mapped internal addresses to reduce SSRF risk.
- Uploaded filenames are reduced to a validated base filename with path traversal checks.
- XML parsing is configured with secure processing enabled and external entity expansion disabled to reduce XXE risk.
- Login, refresh-token, and initial setup flows are rate limited in memory.

## Known Limitations

- Authentication rate limiting is per-process, in-memory only, resets on restart, and does not coordinate across multiple application instances.
- The healthcheck endpoint is intentionally public by design.
- Your effective security posture depends on deployment choices such as reverse proxy configuration, allowed origins, and whether remote auth is enabled.

