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
    private AiServiceEndpointResolver endpointResolver;
    private HttpServer server;

    @BeforeEach
    void setUp() {
        appProperties = new AppProperties();
        appProperties.getAi().setConnectTimeoutMs(1000);
        appProperties.getAi().setReadTimeoutMs(1000);
        endpointResolver = new AiServiceEndpointResolver(appProperties);
        service = new AiServiceHealthService(appProperties, appSettingService, endpointResolver);
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
        startHealthServer(200, "{\"status\":\"ok\",\"mock\":true,\"modelExists\":true,\"modelPath\":\"/models/best.pt\"}");
        when(appSettingService.getAppSettings()).thenReturn(AppSettings.builder()
                .aiPanelDetectionEnabled(true)
                .build());

        AiServiceStatus status = service.getStatus();

        assertThat(status.isEnabled()).isTrue();
        assertThat(status.isServiceReachable()).isTrue();
        assertThat(status.getStatus()).isEqualTo("READY");
        assertThat(status.getMessage()).isEqualTo("AI service is ready.");
        assertThat(status.getModelExists()).isTrue();
        assertThat(status.getModelPath()).isEqualTo("/models/best.pt");
    }

    @Test
    void returnsWarmingWhenHealthPayloadReportsWarming() throws Exception {
        startHealthServer(200, "{\"status\":\"warming\",\"modelExists\":false,\"modelPath\":\"/models/best.pt\"}");
        when(appSettingService.getAppSettings()).thenReturn(AppSettings.builder()
                .aiPanelDetectionEnabled(true)
                .build());

        AiServiceStatus status = service.getStatus();

        assertThat(status.isEnabled()).isTrue();
        assertThat(status.isServiceReachable()).isFalse();
        assertThat(status.getStatus()).isEqualTo("STARTING");
        assertThat(status.getMessage()).contains("preparing the local model file");
        assertThat(status.getModelExists()).isFalse();
        assertThat(status.getModelPath()).isEqualTo("/models/best.pt");
    }

    @Test
    void returnsErrorWhenHealthPayloadReportsMissingLocalModel() throws Exception {
        startHealthServer(200, "{\"status\":\"missing_model\",\"modelExists\":false,\"modelPath\":\"/models/best.pt\"}");
        when(appSettingService.getAppSettings()).thenReturn(AppSettings.builder()
                .aiPanelDetectionEnabled(true)
                .build());

        AiServiceStatus status = service.getStatus();

        assertThat(status.isEnabled()).isTrue();
        assertThat(status.isServiceReachable()).isFalse();
        assertThat(status.getStatus()).isEqualTo("ERROR");
        assertThat(status.getMessage()).contains("no local model file");
        assertThat(status.getError()).contains("/models/best.pt");
        assertThat(status.getModelExists()).isFalse();
    }

    @Test
    void returnsErrorWhenHealthPayloadReportsLoadFailed() throws Exception {
        startHealthServer(200, "{\"status\":\"load_failed\",\"modelExists\":true,\"modelPath\":\"/models/best.pt\",\"loadError\":\"CUDA out of memory\"}");
        when(appSettingService.getAppSettings()).thenReturn(AppSettings.builder()
                .aiPanelDetectionEnabled(true)
                .build());

        AiServiceStatus status = service.getStatus();

        assertThat(status.isEnabled()).isTrue();
        assertThat(status.isServiceReachable()).isFalse();
        assertThat(status.getStatus()).isEqualTo("ERROR");
        assertThat(status.getMessage()).contains("model initialization failed");
        assertThat(status.getError()).isEqualTo("CUDA out of memory");
        assertThat(status.getModelExists()).isTrue();
        assertThat(status.getModelPath()).isEqualTo("/models/best.pt");
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

    @Test
    void fallsBackToLocalhostWhenConfiguredDockerHostIsNotReachable() throws Exception {
        startHealthServer(200, "{\"status\":\"ok\"}");
        int port = server.getAddress().getPort();
        appProperties.getAi().setBaseUrl("http://booklore-ai-panel:" + port);
        when(appSettingService.getAppSettings()).thenReturn(AppSettings.builder()
                .aiPanelDetectionEnabled(true)
                .build());

        AiServiceStatus status = service.getStatus();

        assertThat(status.isServiceReachable()).isTrue();
        assertThat(status.getBaseUrl()).isEqualTo("http://localhost:" + port);
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