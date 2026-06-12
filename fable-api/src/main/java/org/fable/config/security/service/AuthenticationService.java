package org.fable.config.security.service;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.fable.config.AppProperties;
import org.fable.config.security.JwtUtils;
import org.fable.config.security.userdetails.OpdsUserDetails;
import org.fable.exception.ApiError;
import org.fable.model.dto.FableUser;
import org.fable.model.dto.request.UserLoginRequest;
import org.fable.model.dto.response.AccessTokenResponse;
import org.fable.model.entity.FableUserEntity;
import org.fable.model.entity.RefreshTokenEntity;
import org.fable.model.enums.ProvisioningMethod;
import org.fable.model.enums.UserPermission;
import org.fable.repository.RefreshTokenRepository;
import org.fable.repository.UserRepository;
import org.fable.service.appsettings.AppSettingService;
import org.fable.service.user.DefaultSettingInitializer;
import org.fable.service.user.UserProvisioningService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.fable.model.enums.AuditAction;
import org.fable.service.audit.AuditService;
import org.fable.util.RequestUtils;

@Slf4j
@Service
public class AuthenticationService {

    private String dummyPasswordHash;

    private final AppProperties appProperties;
    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final UserProvisioningService userProvisioningService;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtils jwtUtils;
    private final DefaultSettingInitializer defaultSettingInitializer;
    private final AuditService auditService;
    private final AuthRateLimitService authRateLimitService;
    private final AppSettingService appSettingService;

    public AuthenticationService(
            AppProperties appProperties,
            UserRepository userRepository,
            RefreshTokenRepository refreshTokenRepository,
            UserProvisioningService userProvisioningService,
            PasswordEncoder passwordEncoder,
            JwtUtils jwtUtils,
            DefaultSettingInitializer defaultSettingInitializer,
            AuditService auditService,
            AuthRateLimitService authRateLimitService,
            @Lazy AppSettingService appSettingService
    ) {
        this.appProperties = appProperties;
        this.userRepository = userRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.userProvisioningService = userProvisioningService;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtils = jwtUtils;
        this.defaultSettingInitializer = defaultSettingInitializer;
        this.auditService = auditService;
        this.authRateLimitService = authRateLimitService;
        this.appSettingService = appSettingService;
    }

    @PostConstruct
    void initDummyHash() {
        this.dummyPasswordHash = passwordEncoder.encode("_dummy_placeholder_for_timing_equalization_");
    }

    public FableUser getAuthenticatedUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null) {
            return null;
        }
        Object principal = authentication.getPrincipal();
        if (principal instanceof FableUser user) {
            if (user.getId() != null && user.getId() != -1L) {
                defaultSettingInitializer.ensureDefaultSettings(user);
            }
            return user;
        }
        throw new IllegalStateException("Authenticated principal is not of type FableUser");
    }

    public FableUser getSystemUser() {
        return createSystemUser();
    }

    private FableUser createSystemUser() {
        FableUser.UserPermissions permissions = new FableUser.UserPermissions();
        for (UserPermission permission : UserPermission.values()) {
            permission.setInDto(permissions, true);
        }

        return FableUser.builder()
                .id(-1L)
                .username("system")
                .name("System User")
                .email("system@fable.internal")
                .provisioningMethod(ProvisioningMethod.LOCAL)
                .isDefaultPassword(false)
                .permissions(permissions)
                .assignedLibraries(List.of())
                .userSettings(new FableUser.UserSettings())
                .build();
    }

    public OpdsUserDetails getOpdsUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof OpdsUserDetails opdsUser) {
            return opdsUser;
        }
        throw new IllegalStateException("No OPDS user authenticated");
    }

    public ResponseEntity<AccessTokenResponse> loginUser(UserLoginRequest loginRequest) {
        if (appSettingService.getAppSettings().isOidcForceOnlyMode()) {
            FableUserEntity oidcCheckUser = userRepository.findByUsername(loginRequest.getUsername()).orElse(null);
            if (oidcCheckUser == null || !oidcCheckUser.getPermissions().isPermissionAdmin()) {
                throw ApiError.OIDC_ONLY_MODE.createException();
            }
        }

        String ip = RequestUtils.getCurrentRequest().getRemoteAddr();
        String username = loginRequest.getUsername();
        authRateLimitService.checkLoginRateLimit(ip);
        authRateLimitService.checkLoginRateLimitByUsername(username);

        FableUserEntity user = userRepository.findByUsername(username).orElse(null);

        if (user == null) {
            // Constant-time dummy BCrypt check prevents timing-based user enumeration:
            // without this, unknown-user responses are ~3x faster than wrong-password responses.
            passwordEncoder.matches(loginRequest.getPassword(), dummyPasswordHash);
            auditService.log(AuditAction.LOGIN_FAILED, "Login failed for unknown user: " + username);
            authRateLimitService.recordFailedLoginAttempt(ip);
            authRateLimitService.recordFailedLoginAttemptByUsername(username);
            throw ApiError.INVALID_CREDENTIALS.createException();
        }

        if (!passwordEncoder.matches(loginRequest.getPassword(), user.getPasswordHash())) {
            auditService.log(AuditAction.LOGIN_FAILED, "Login failed for user: " + username);
            authRateLimitService.recordFailedLoginAttempt(ip);
            authRateLimitService.recordFailedLoginAttemptByUsername(username);
            throw ApiError.INVALID_CREDENTIALS.createException();
        }

        authRateLimitService.resetLoginAttempts(ip);
        authRateLimitService.resetLoginAttemptsByUsername(username);
        return loginUser(user);
    }

    public ResponseEntity<AccessTokenResponse> loginRemote(String name, String username, String email, String groups) {
        if (username == null || username.isEmpty()) {
            throw ApiError.GENERIC_BAD_REQUEST.createException("Remote-User header is missing");
        }

        Optional<FableUserEntity> user = userRepository.findByUsername(username);
        if (user.isEmpty() && appProperties.getRemoteAuth().isCreateNewUsers()) {
            user = Optional.of(userProvisioningService.provisionRemoteUserFromHeaders(name, username, email, groups));
        }

        if (user.isEmpty()) {
            throw ApiError.INTERNAL_SERVER_ERROR.createException("User not found and remote user creation is disabled");
        }

        return loginUser(user.get());
    }

    public ResponseEntity<AccessTokenResponse> loginUser(FableUserEntity user) {
        return loginUser(user, null);
    }

    public ResponseEntity<AccessTokenResponse> loginUser(FableUserEntity user, Long customRefreshTokenExpirationMs) {
        String accessToken = jwtUtils.generateAccessToken(user);
        String refreshToken = jwtUtils.generateRefreshToken(user);

        long expirationMs = customRefreshTokenExpirationMs != null ? customRefreshTokenExpirationMs : JwtUtils.getRefreshTokenExpirationMs();

        RefreshTokenEntity refreshTokenEntity = RefreshTokenEntity.builder()
                .user(user)
                .token(refreshToken)
                .expiryDate(Instant.now().plusMillis(expirationMs))
                .revoked(false)
                .build();

        refreshTokenRepository.save(refreshTokenEntity);
        auditService.log(AuditAction.LOGIN_SUCCESS, "User", user.getId(), "Login successful for user: " + user.getUsername());

        return createTokenResponse(user, accessToken, refreshTokenEntity.getToken());
    }

    public ResponseEntity<AccessTokenResponse> refreshToken(String token) {
        String ip = RequestUtils.getCurrentRequest().getRemoteAddr();
        authRateLimitService.checkRefreshRateLimit(ip);

        RefreshTokenEntity storedToken = refreshTokenRepository.findByToken(token).orElseThrow(() -> {
            authRateLimitService.recordFailedRefreshAttempt(ip);
            return ApiError.INVALID_CREDENTIALS.createException("Refresh token not found");
        });

        if (storedToken.isRevoked() || storedToken.getExpiryDate().isBefore(Instant.now()) || !jwtUtils.validateToken(token)) {
            authRateLimitService.recordFailedRefreshAttempt(ip);
            throw ApiError.INVALID_CREDENTIALS.createException("Invalid or expired refresh token");
        }

        FableUserEntity user = storedToken.getUser();

        storedToken.setRevoked(true);
        storedToken.setRevocationDate(Instant.now());
        refreshTokenRepository.save(storedToken);

        String newRefreshToken = jwtUtils.generateRefreshToken(user);
        RefreshTokenEntity newRefreshTokenEntity = RefreshTokenEntity.builder()
                .user(user)
                .token(newRefreshToken)
                .expiryDate(Instant.now().plusMillis(JwtUtils.getRefreshTokenExpirationMs()))
                .revoked(false)
                .build();

        refreshTokenRepository.save(newRefreshTokenEntity);

        authRateLimitService.resetRefreshAttempts(ip);

        return createTokenResponse(user, jwtUtils.generateAccessToken(user), newRefreshToken);
    }

    private ResponseEntity<AccessTokenResponse> createTokenResponse(FableUserEntity user, String accessToken, String refreshToken) {
        long accessTokenExpiry = Instant.now().plusMillis(JwtUtils.getAccessTokenExpirationMs()).toEpochMilli();
        return ResponseEntity.ok(new AccessTokenResponse(
                accessToken,
                refreshToken,
                accessTokenExpiry,
                user.isDefaultPassword()
        ));
    }
}