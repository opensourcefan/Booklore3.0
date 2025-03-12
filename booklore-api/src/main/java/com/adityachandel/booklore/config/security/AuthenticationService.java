package com.adityachandel.booklore.config.security;

import com.adityachandel.booklore.exception.ApiError;
import com.adityachandel.booklore.model.dto.BookLoreUser;
import com.adityachandel.booklore.model.dto.request.UserLoginRequest;
import com.adityachandel.booklore.model.entity.BookLoreUserEntity;
import com.adityachandel.booklore.repository.UserRepository;
import lombok.AllArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.Map;

@AllArgsConstructor
@Service
public class AuthenticationService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtils jwtUtils;

    public BookLoreUser getAuthenticatedUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return (BookLoreUser) authentication.getPrincipal();
    }

    public ResponseEntity<Map<String, String>> loginUser(UserLoginRequest loginRequest) {
        BookLoreUserEntity user = userRepository.findByUsername(loginRequest.getUsername()).orElseThrow(() -> ApiError.USER_NOT_FOUND.createException(loginRequest.getUsername()));

        if (!passwordEncoder.matches(loginRequest.getPassword(), user.getPasswordHash())) {
            throw ApiError.INVALID_CREDENTIALS.createException();
        }

        String accessToken = jwtUtils.generateAccessToken(user);
        String refreshToken = jwtUtils.generateRefreshToken(user);

        boolean isDefaultPassword = user.isDefaultPassword();

        return ResponseEntity.ok(Map.of(
                "accessToken", accessToken,
                "refreshToken", refreshToken,
                "isDefaultPassword", String.valueOf(isDefaultPassword)
        ));
    }

    public ResponseEntity<Map<String, String>> refreshToken(String refreshToken) {
        if (!jwtUtils.validateToken(refreshToken)) {
            throw ApiError.INVALID_CREDENTIALS.createException();
        }

        String username = jwtUtils.extractUsername(refreshToken);
        BookLoreUserEntity user = userRepository.findByUsername(username).orElseThrow(() -> ApiError.USER_NOT_FOUND.createException(username));

        String newAccessToken = jwtUtils.generateAccessToken(user);
        String newRefreshToken = jwtUtils.generateRefreshToken(user);

        return ResponseEntity.ok(Map.of("accessToken", newAccessToken, "refreshToken", newRefreshToken));
    }
}