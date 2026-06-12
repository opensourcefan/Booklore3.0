package org.fable.config.security;

import org.fable.model.entity.FableUserEntity;
import org.fable.service.security.JwtSecretService;
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
        FableUserEntity user = FableUserEntity.builder()
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