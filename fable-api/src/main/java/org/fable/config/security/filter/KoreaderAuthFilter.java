package org.fable.config.security.filter;

import org.fable.config.security.userdetails.KoreaderUserDetails;
import org.fable.repository.KoreaderUserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.fable.util.Md5Util;

import java.io.IOException;
import java.util.List;

@RequiredArgsConstructor
@Component
@Slf4j
public class KoreaderAuthFilter extends OncePerRequestFilter {

    private final KoreaderUserRepository koreaderUserRepository;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {

        String path = request.getRequestURI();
        if (!path.startsWith("/api/koreader/")) {
            chain.doFilter(request, response);
            return;
        }

        String username = request.getHeader("x-auth-user");
        String key = request.getHeader("x-auth-key");

        if (username != null && key != null) {
            koreaderUserRepository.findByUsername(username).ifPresentOrElse(user -> {
                if (Md5Util.constantTimeEqualsHex(user.getPasswordMD5(), key)) {
                    Long fableUserId = null;
                    if (user.getFableUser() != null) {
                        fableUserId = user.getFableUser().getId();
                    }

                    UserDetails userDetails = new KoreaderUserDetails(
                            user.getUsername(),
                            user.getPasswordMD5(),
                            user.isSyncEnabled(),
                            user.isSyncWithFableReader(),
                            fableUserId,
                            List.of(new SimpleGrantedAuthority("ROLE_USER"))
                    );

                    UsernamePasswordAuthenticationToken auth = new UsernamePasswordAuthenticationToken(userDetails, null, userDetails.getAuthorities());

                    SecurityContextHolder.getContext().setAuthentication(auth);
                } else {
                    log.warn("KOReader auth failed: password mismatch for user '{}'", username);
                }
            }, () -> log.warn("KOReader user '{}' not found", username));
        } else {
            log.warn("Missing KOReader headers");
        }

        chain.doFilter(request, response);
    }
}