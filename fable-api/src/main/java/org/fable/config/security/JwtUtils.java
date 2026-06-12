package org.fable.config.security;

import org.fable.model.entity.FableUserEntity;
import org.fable.service.security.JwtSecretService;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

@Slf4j
@Service
@Component
@RequiredArgsConstructor
public class JwtUtils {

    private final JwtSecretService jwtSecretService;
    @Getter
    public static final long accessTokenExpirationMs = 1000L * 60 * 60 * 10;  // 10 hours
    @Getter
    public static final long refreshTokenExpirationMs = 1000L * 60 * 60 * 24 * 30; // 30 days

    private SecretKey getSigningKey() {
        String secretKey = jwtSecretService.getSecret();
        return Keys.hmacShaKeyFor(secretKey.getBytes(StandardCharsets.UTF_8));
    }

    public String generateToken(FableUserEntity user, boolean isRefreshToken) {
        long expirationTime = isRefreshToken ? refreshTokenExpirationMs : accessTokenExpirationMs;
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(user.getUsername())
                .claim("userId", user.getId())
                .claim("isDefaultPassword", user.isDefaultPassword())
            .id(UUID.randomUUID().toString())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusMillis(expirationTime)))
                .signWith(getSigningKey(), Jwts.SIG.HS256)
                .compact();
    }

    public String generateAccessToken(FableUserEntity user) {
        return generateToken(user, false);
    }

    public String generateRefreshToken(FableUserEntity user) {
        return generateToken(user, true);
    }

    public boolean validateToken(String token) {
        try {
            extractClaims(token);
            return true;
        } catch (ExpiredJwtException e) {
            log.debug("Token expired: {}", e.getMessage());
        } catch (JwtException e) {
            log.debug("Invalid token: {}", e.getMessage());
        }
        return false;
    }

    public Claims extractClaims(String token) {
        return Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public String extractUsername(String token) {
        return extractClaims(token).getSubject();
    }

    public Long extractUserId(String token) {
        Object userIdClaim = extractClaims(token).get("userId");
        if (userIdClaim instanceof Number) {
            return ((Number) userIdClaim).longValue();
        }
        throw new IllegalArgumentException("Invalid userId claim type");
    }
}