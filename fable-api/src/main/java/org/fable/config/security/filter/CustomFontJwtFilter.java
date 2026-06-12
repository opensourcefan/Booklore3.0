package org.fable.config.security.filter;

import org.fable.config.security.JwtUtils;
import org.fable.config.security.service.AuthenticatedUserEntityService;
import org.fable.mapper.custom.FableUserTransformer;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

@Component
public class CustomFontJwtFilter extends AbstractQueryParameterJwtFilter {

    public CustomFontJwtFilter(
            JwtUtils jwtUtils,
            AuthenticatedUserEntityService authenticatedUserEntityService,
            FableUserTransformer fableUserTransformer) {
        super(jwtUtils, authenticatedUserEntityService, fableUserTransformer);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return !(path.startsWith("/api/v1/custom-fonts/") && path.endsWith("/file"));
    }
}
