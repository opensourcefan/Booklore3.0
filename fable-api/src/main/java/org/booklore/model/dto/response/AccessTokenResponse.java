package org.booklore.model.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;

public record AccessTokenResponse(
        String accessToken,
        String refreshToken,
        long expires,
        @JsonProperty("isDefaultPassword") boolean isDefaultPassword
) {}