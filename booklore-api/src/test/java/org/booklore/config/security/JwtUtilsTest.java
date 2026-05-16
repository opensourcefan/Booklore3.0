package org.booklore.config.security;

import org.booklore.model.entity.BookLoreUserEntity;
import org.booklore.service.security.JwtSecretService;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class JwtUtilsTest {

    @Test
    void generateRefreshToken_addsUniqueJwtIdForRepeatedCalls() {
        JwtSecretService jwtSecretService = mock(JwtSecretService.class);
        when(jwtSecretService.getSecret()).thenReturn("12345678901234567890123456789012");

        JwtUtils jwtUtils = new JwtUtils(jwtSecretService);
        BookLoreUserEntity user = BookLoreUserEntity.builder()
                .id(42L)
                .username("admin")
                .isDefaultPassword(false)
                .build();

        String firstToken = jwtUtils.generateRefreshToken(user);
        String secondToken = jwtUtils.generateRefreshToken(user);

        assertThat(firstToken).isNotEqualTo(secondToken);
        assertThat(jwtUtils.validateToken(firstToken)).isTrue();
        assertThat(jwtUtils.validateToken(secondToken)).isTrue();
        assertThat(jwtUtils.extractUserId(firstToken)).isEqualTo(42L);
        assertThat(jwtUtils.extractUsername(secondToken)).isEqualTo("admin");
    }
}