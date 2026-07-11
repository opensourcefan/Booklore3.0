package org.fable.config.security.filter;

import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;

/**
 * Writes a plain 401/403 response without {@link HttpServletResponse#sendError(int, String)}.
 * {@code sendError} triggers Spring Boot's {@code ErrorPageFilter} forward to {@code /error},
 * which renders the Whitelabel HTML page — visible in browsers (and iframes) when cover,
 * EPUB, or audiobook URLs are requested with an expired access token after idle.
 */
final class UnauthorizedResponseWriter {

    private UnauthorizedResponseWriter() {
    }

    static void write(HttpServletResponse response, int status, String message) throws IOException {
        if (response.isCommitted()) {
            return;
        }
        response.resetBuffer();
        response.setStatus(status);
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        String safeMessage = message == null ? "" : message.replace("\\", "\\\\").replace("\"", "\\\"");
        response.getWriter().write("{\"status\":" + status + ",\"message\":\"" + safeMessage + "\"}");
    }
}
