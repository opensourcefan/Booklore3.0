package org.fable.config.security.service;

import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.fable.config.security.oidc.OidcDiscoveryService;
import org.fable.exception.ApiError;
import org.fable.model.dto.response.LogoutResponse;
import org.fable.model.entity.FableUserEntity;
import org.fable.model.entity.OidcSessionEntity;
import org.fable.model.entity.RefreshTokenEntity;
import org.fable.model.enums.AuditAction;
import org.fable.model.enums.ProvisioningMethod;
import org.fable.repository.OidcSessionRepository;
import org.fable.repository.RefreshTokenRepository;
import org.fable.repository.UserRepository;
import org.fable.service.appsettings.AppSettingService;
import org.fable.service.audit.AuditService;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.web.util.UriComponentsBuilder;

import java.time.Instant;

@Slf4j
@Service
@AllArgsConstructor
public class LogoutService {

    private final RefreshTokenRepository refreshTokenRepository;
    private final OidcSessionRepository oidcSessionRepository;
    private final UserRepository userRepository;
    private final AppSettingService appSettingService;
    private final OidcDiscoveryService discoveryService;
    private final AuditService auditService;
    private final AuthenticationService authenticationService;

    public LogoutResponse logout(Authentication auth, String refreshToken, String origin) {
        FableUserEntity user = resolveUser(auth, refreshToken);

        revokeRefreshToken(user);

        String logoutUrl = null;
        if (user.getProvisioningMethod() == ProvisioningMethod.OIDC && appSettingService.getAppSettings().isOidcEnabled()) {
            logoutUrl = buildOidcLogoutUrl(user, origin);
        }

        auditService.log(AuditAction.LOGOUT, "User", user.getId(), "User logged out: " + user.getUsername());
        return new LogoutResponse(logoutUrl);
    }

    private FableUserEntity resolveUser(Authentication auth, String refreshToken) {
        if (auth != null && auth.isAuthenticated() && !"anonymousUser".equals(auth.getPrincipal())) {
            var fableUser = authenticationService.getAuthenticatedUser();
            return userRepository.findByUsername(fableUser.getUsername())
                    .orElseThrow(() -> ApiError.GENERIC_UNAUTHORIZED.createException("User not found"));
        }

        if (refreshToken != null && !refreshToken.isBlank()) {
            RefreshTokenEntity tokenEntity = refreshTokenRepository.findByToken(refreshToken)
                    .orElseThrow(() -> ApiError.GENERIC_UNAUTHORIZED.createException("Invalid refresh token"));
            return tokenEntity.getUser();
        }

        throw ApiError.GENERIC_UNAUTHORIZED.createException("No authentication context or refresh token provided");
    }

    private void revokeRefreshToken(FableUserEntity user) {
        refreshTokenRepository.findAllByUserAndRevokedFalse(user).forEach(token -> {
            token.setRevoked(true);
            token.setRevocationDate(Instant.now());
            refreshTokenRepository.save(token);
        });
    }

    private String buildOidcLogoutUrl(FableUserEntity user, String origin) {
        try {
            var providerDetails = appSettingService.getAppSettings().getOidcProviderDetails();
            var session = oidcSessionRepository.findFirstByUserIdAndRevokedFalseOrderByCreatedAtDesc(user.getId());

            if (session.isPresent()) {
                OidcSessionEntity oidcSession = session.get();
                oidcSession.setRevoked(true);
                oidcSessionRepository.save(oidcSession);

                var discovery = discoveryService.discover(providerDetails.getIssuerUri());
                if (discovery.endSessionEndpoint() != null) {
                    String postLogoutRedirectUri = (origin != null && !origin.isBlank() ? origin : "") + "/login";

                    var builder = UriComponentsBuilder.fromUriString(discovery.endSessionEndpoint())
                            .queryParam("client_id", providerDetails.getClientId())
                            .queryParam("id_token_hint", oidcSession.getIdTokenHint());

                    if (!postLogoutRedirectUri.equals("/login")) {
                        builder.queryParam("post_logout_redirect_uri", postLogoutRedirectUri);
                    }

                    return builder.build().toUriString();
                }
            }
        } catch (Exception e) {
            log.warn("Failed to build OIDC logout URL: {}", e.getMessage());
        }
        return null;
    }
}
