package org.booklore.interceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.booklore.service.appsettings.AppSettingService;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
@RequiredArgsConstructor
public class AiSearchEnabledInterceptor implements HandlerInterceptor {

    private final AppSettingService appSettingService;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        // Always allow the /status endpoint so the UI can check service health
        // even when AI Search is disabled.
        if (request.getRequestURI().endsWith("/api/v1/ai/search/status")) {
            return true;
        }

        if (!appSettingService.getAppSettings().isAiSearchEnabled()) {
            response.sendError(HttpServletResponse.SC_FORBIDDEN, "AI Search is disabled.");
            return false;
        }

        return true;
    }
}
