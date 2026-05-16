package org.booklore.config.security.filter;

import org.booklore.config.security.JwtUtils;
import org.booklore.config.security.service.AuthenticatedUserEntityService;
import org.booklore.mapper.custom.BookLoreUserTransformer;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

@Component
public class CoverJwtFilter extends AbstractQueryParameterJwtFilter {

    public CoverJwtFilter(
            JwtUtils jwtUtils,
            AuthenticatedUserEntityService authenticatedUserEntityService,
            BookLoreUserTransformer bookLoreUserTransformer) {
        super(jwtUtils, authenticatedUserEntityService, bookLoreUserTransformer);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return !path.startsWith("/api/v1/media/");
    }
}
