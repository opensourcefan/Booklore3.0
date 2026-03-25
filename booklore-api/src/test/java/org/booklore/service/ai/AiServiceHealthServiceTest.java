package org.booklore.service.ai;

import com.sun.net.httpserver.HttpServer;
import org.booklore.config.AppProperties;
import org.booklore.model.dto.ai.AiServiceStatus;
import org.booklore.model.dto.settings.AppSettings;
import org.booklore.service.appsettings.AppSettingService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiServiceHealthServiceTest {

    @Mock
    private AppSettingService appSettingService;

    private AppProperties appProperties;
    private AiServiceHealthService service;
    private HttpServer server;

    @BeforeEach
    void setUp() {
        appProperties = new AppProperties();
        appProperties.getAi().setConnectTimeoutMs(1000);
        appProperties.getAi().setReadTimeoutMs(1000);
        service = new AiServiceHealthService(appProperties, appSettingService);
    }

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void returnsDisabledWhenFeatureIsTurnedOff() {
        when(appSettingService.getAppSettings()).thenReturn(AppSettings.builder()
                .aiPanelDetectionEnabled(false)
                .build());

        AiServiceStatus status = service.getStatus();

        assertThat(status.isEnabled()).isFalse();
        assertThat(status.isServiceReachable()).isFalse();
        assertThat(status.getStatus()).isEqualTo("DISABLED");
    }

    @Test
    void returnsReadyWhenHealthPayloadReportsOk() throws Exception {
        startHealthServer(200, "{\"status\":\"ok\",\"mock\":true}");
        when(appSettingService.getAppSettings()).thenReturn(AppSettings.builder()
                .aiPanelDetectionEnabled(true)
                .build());

        AiServiceStatus status = service.getStatus();

        assertThat(status.isEnabled()).isTrue();
        assertThat(status.isServiceReachable()).isTrue();
        assertThat(status.getStatus()).isEqualTo("READY");
        assertThat(status.getMessage()).isEqualTo("AI service is ready.");
    }

    @Test
    void returnsWarmingWhenHealthPayloadReportsWarming() throws Exception {
        startHealthServer(200, "{\"status\":\"warming\",\"modelExists\":false}");
        when(appSettingService.getAppSettings()).thenReturn(AppSettings.builder()
                .aiPanelDetectionEnabled(true)
                .build());

        AiServiceStatus status = service.getStatus();

        assertThat(status.isEnabled()).isTrue();
        assertThat(status.isServiceReachable()).isFalse();
        assertThat(status.getStatus()).isEqualTo("WARMING");
        assertThat(status.getMessage()).contains("model is not ready");
    }

    @Test
    void returnsErrorWhenHealthPayloadHasUnknownStatus() throws Exception {
        startHealthServer(200, "{\"status\":\"mystery\"}");
        when(appSettingService.getAppSettings()).thenReturn(AppSettings.builder()
                .aiPanelDetectionEnabled(true)
                .build());

        AiServiceStatus status = service.getStatus();

        assertThat(status.isEnabled()).isTrue();
        assertThat(status.isServiceReachable()).isFalse();
        assertThat(status.getStatus()).isEqualTo("ERROR");
        assertThat(status.getError()).contains("mystery");
    }

    private void startHealthServer(int responseCode, String responseBody) throws IOException {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/health", exchange -> {
            byte[] body = responseBody.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(responseCode, body.length);
            try (OutputStream outputStream = exchange.getResponseBody()) {
                outputStream.write(body);
            }
        });
        server.start();

        appProperties.getAi().setBaseUrl("http://127.0.0.1:" + server.getAddress().getPort());
    }
}