package org.fable.interceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.fable.service.appsettings.AppSettingService;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
@RequiredArgsConstructor
public class AiPanelDetectionEnabledInterceptor implements HandlerInterceptor {

    private final AppSettingService appSettingService;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        if (!appSettingService.getAppSettings().isAiPanelDetectionEnabled()) {
            response.sendError(HttpServletResponse.SC_FORBIDDEN, "AI panel detection is disabled.");
            return false;
        }

        return true;
    }
}