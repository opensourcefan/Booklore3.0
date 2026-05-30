package org.booklore.interceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.booklore.model.dto.settings.AppSettings;
import org.booklore.service.appsettings.AppSettingService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AiPanelDetectionEnabledInterceptorTest {

    private AiPanelDetectionEnabledInterceptor interceptor;

    @Mock
    private AppSettingService appSettingService;

    @Mock
    private HttpServletRequest request;

    @Mock
    private HttpServletResponse response;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        interceptor = new AiPanelDetectionEnabledInterceptor(appSettingService);
    }

    @Test
    void blocksRequestWhenAiPanelDetectionIsDisabled() throws Exception {
        when(appSettingService.getAppSettings()).thenReturn(AppSettings.builder()
                .aiPanelDetectionEnabled(false)
                .build());

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertThat(allowed).isFalse();
        verify(response).sendError(HttpServletResponse.SC_FORBIDDEN, "AI panel detection is disabled.");
    }

    @Test
    void allowsRequestWhenAiPanelDetectionIsEnabled() throws Exception {
        when(appSettingService.getAppSettings()).thenReturn(AppSettings.builder()
                .aiPanelDetectionEnabled(true)
                .build());

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertThat(allowed).isTrue();
    }
}