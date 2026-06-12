package org.fable.config.security.filter;

import org.fable.config.security.JwtUtils;
import org.fable.config.security.service.AuthenticatedUserEntityService;
import org.fable.config.security.userdetails.UserAuthenticationDetails;
import org.fable.mapper.custom.FableUserTransformer;
import org.fable.model.dto.FableUser;
import org.fable.model.entity.FableUserEntity;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.AllArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.regex.Pattern;

@Component
@AllArgsConstructor
public class EpubStreamingJwtFilter extends OncePerRequestFilter {

    private static final Pattern EPUB_STREAMING_ENDPOINT_PATTERN = Pattern.compile("/api/v1/epub/\\d+/file/.*");
    private final JwtUtils jwtUtils;
    private final AuthenticatedUserEntityService authenticatedUserEntityService;
    private final FableUserTransformer fableUserTransformer;

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return !EPUB_STREAMING_ENDPOINT_PATTERN.matcher(path).matches();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {

        String token = extractTokenFromHeader(request);
        if (token == null) {
            token = request.getParameter("token");
        }

        if (token == null || token.isEmpty()) {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Missing authentication token");
            return;
        }

        try {
            if (jwtUtils.validateToken(token)) {
                authenticateUser(token, request);
            } else {
                response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Invalid token");
                return;
            }
        } catch (Exception ex) {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Authentication failed: " + ex.getMessage());
            return;
        }

        chain.doFilter(request, response);
    }

    private String extractTokenFromHeader(HttpServletRequest request) {
        String bearer = request.getHeader("Authorization");
        return (bearer != null && bearer.startsWith("Bearer ")) ? bearer.substring(7) : null;
    }

    private void authenticateUser(String token, HttpServletRequest request) {
        Long userId = jwtUtils.extractUserId(token);
        FableUserEntity entity = authenticatedUserEntityService.loadForAuthentication(userId);
        FableUser user = fableUserTransformer.toDTO(entity);
        UsernamePasswordAuthenticationToken authentication =
                new UsernamePasswordAuthenticationToken(user, null, null);
        authentication.setDetails(new UserAuthenticationDetails(request, user.getId()));
        SecurityContextHolder.getContext().setAuthentication(authentication);
    }
}
