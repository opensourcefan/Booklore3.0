package org.booklore.controller;

import org.booklore.model.dto.ai.AiBulkScanRequest;
import org.booklore.model.dto.ai.AiBulkScanResponse;
import org.booklore.model.dto.ai.AiPanelFlowStatsResponse;
import org.booklore.service.ai.ComicPanelFlowService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.HttpStatusCode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.JsonNode;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import org.mockito.ArgumentCaptor;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ComicPanelFlowControllerTest {

    @Mock
    private ComicPanelFlowService comicPanelFlowService;

    private ComicPanelFlowController controller;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        controller = new ComicPanelFlowController(comicPanelFlowService, new ObjectMapper());
    }

    @Test
    void rejectsInvalidPanelFlowPayload() {
        var response = controller.savePanelFlow(12L, Map.of("data", "{\"pages\":[{\"pageNumber\":1,\"panels\":[{\"x\":0.1}]}]}"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatusCode.valueOf(400));
        verifyNoInteractions(comicPanelFlowService);
    }

    @Test
    void acceptsValidPanelFlowPayload() throws Exception {
        var response = controller.savePanelFlow(12L, Map.of(
                "data", Map.of(
                        "source", "test",
                        "pages", List.of(Map.of(
                                "pageNumber", 1,
                                "panels", List.of(Map.of(
                                        "x", 0.1,
                                        "y", 0.2,
                                        "width", 0.3,
                                        "height", 0.4,
                                        "confidence", 0.9
                                ))
                        ))
                )
        ));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatusCode.valueOf(204));

                ArgumentCaptor<String> payloadCaptor = ArgumentCaptor.forClass(String.class);
                verify(comicPanelFlowService).savePanelFlow(eq(12L), payloadCaptor.capture());

                JsonNode actualPayload = new ObjectMapper().readTree(payloadCaptor.getValue());
                JsonNode expectedPayload = new ObjectMapper().readTree("""
                                {
                                    "source": "test",
                                    "pages": [
                                        {
                                            "pageNumber": 1,
                                            "panels": [
                                                {
                                                    "x": 0.1,
                                                    "y": 0.2,
                                                    "width": 0.3,
                                                    "height": 0.4,
                                                    "confidence": 0.9
                                                }
                                            ]
                                        }
                                    ]
                                }
                                """);

                assertThat(actualPayload).isEqualTo(expectedPayload);
    }

    @Test
    void startsMissingScanForSelectedPaths() {
        AiBulkScanRequest request = new AiBulkScanRequest();
        request.setLibraryPathIds(List.of(4L, 8L));

        when(comicPanelFlowService.startScanMissingPanelFlow(List.of(4L, 8L))).thenReturn(AiBulkScanResponse.builder()
                .started(true)
                .missingBooks(3)
                .alreadyScannedBooks(2)
                .totalEligibleBooks(5)
                .message("Started scanning missing AI panel data in the background.")
                .build());

        var response = controller.scanMissingPanelFlow(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatusCode.valueOf(200));
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().isStarted()).isTrue();
        assertThat(response.getBody().getMissingBooks()).isEqualTo(3);
    }

    @Test
    void passesOptionalLibraryIdToStatsQuery() {
        AiPanelFlowStatsResponse stats = AiPanelFlowStatsResponse.builder()
                .scannedComicCount(5)
                .storedBytes(2048)
                .build();

        when(comicPanelFlowService.getPanelFlowStatsForCurrentUser(42L)).thenReturn(stats);

        var response = controller.getPanelFlowStats(42L);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatusCode.valueOf(200));
        assertThat(response.getBody()).isEqualTo(stats);
        verify(comicPanelFlowService).getPanelFlowStatsForCurrentUser(42L);
    }
}