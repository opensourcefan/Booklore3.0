package org.booklore.config.security.filter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.booklore.context.KomgaCleanContext;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Servlet filter that guarantees {@link KomgaCleanContext} is cleared at the end of every
 * request, even when the MVC interceptor chain is bypassed (e.g. a filter-level exception
 * before the DispatcherServlet is reached, or an async dispatch path that does not re-enter
 * the interceptor chain).
 *
 * <p>This is a safety-net complementing {@code KomgaCleanInterceptor.afterCompletion()}.
 * Calling {@link KomgaCleanContext#clear()} is idempotent — if the interceptor already
 * cleaned up, this is a harmless no-op.
 */
@Component
public class KomgaCleanContextFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        try {
            filterChain.doFilter(request, response);
        } finally {
            KomgaCleanContext.clear();
        }
    }
}
