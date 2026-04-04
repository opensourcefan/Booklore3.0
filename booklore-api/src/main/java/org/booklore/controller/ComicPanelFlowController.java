package org.booklore.controller;

import lombok.RequiredArgsConstructor;
import org.booklore.config.security.annotation.CheckBookAccess;
import org.booklore.model.dto.ai.AiBulkScanRequest;
import org.booklore.model.dto.ai.AiBulkScanResponse;
import org.booklore.model.dto.ai.AiPanelFlowStatsResponse;
import org.booklore.service.ai.ComicPanelFlowService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.ObjectMapper;

import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/ai/panel-flow")
public class ComicPanelFlowController {

    private final ComicPanelFlowService comicPanelFlowService;
    private final ObjectMapper objectMapper;

    @GetMapping("/book/{bookId}")
    @CheckBookAccess(bookIdParam = "bookId")
    public ResponseEntity<Map<String, String>> getPanelFlow(@PathVariable Long bookId) {
        return comicPanelFlowService.getPanelFlow(bookId)
                .map(data -> ResponseEntity.ok(Map.of("data", data)))
                .orElse(ResponseEntity.noContent().build());
    }

    @PutMapping("/book/{bookId}")
    @CheckBookAccess(bookIdParam = "bookId")
    public ResponseEntity<Void> savePanelFlow(@PathVariable Long bookId, @RequestBody Map<String, Object> body) {
        if (body == null) {
            return ResponseEntity.badRequest().build();
        }

        Object data = body.get("data");
        if (data == null) {
            return ResponseEntity.badRequest().build();
        }

        String payload = data instanceof String
                ? (String) data
                : toJson(data);

        if (!isValidPanelFlowPayload(payload)) {
            return ResponseEntity.badRequest().build();
        }

        comicPanelFlowService.savePanelFlow(bookId, payload);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/book/{bookId}")
    @CheckBookAccess(bookIdParam = "bookId")
    public ResponseEntity<Void> deletePanelFlow(@PathVariable Long bookId) {
        comicPanelFlowService.deletePanelFlow(bookId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/book/{bookId}/scan")
    @CheckBookAccess(bookIdParam = "bookId")
    public ResponseEntity<Map<String, String>> scanPanelFlow(@PathVariable Long bookId,
                                                              @RequestBody(required = false) Map<String, Object> body) {
        String bookType = body != null && body.get("bookType") != null
                ? body.get("bookType").toString()
                : null;

        String data = comicPanelFlowService.scanAndSavePanelFlow(bookId, bookType);
        return ResponseEntity.ok(Map.of("data", data));
    }

    @DeleteMapping
    public ResponseEntity<Map<String, Long>> deleteAllPanelFlowForCurrentUser() {
        long deletedCount = comicPanelFlowService.deleteAllPanelFlowForCurrentUser();
        return ResponseEntity.ok(Map.of("deletedCount", deletedCount));
    }

    @GetMapping("/stats")
    public ResponseEntity<AiPanelFlowStatsResponse> getPanelFlowStats(@RequestParam(required = false) Long libraryId) {
        return ResponseEntity.ok(comicPanelFlowService.getPanelFlowStatsForCurrentUser(libraryId));
    }

    @PostMapping("/scan-missing")
    public ResponseEntity<AiBulkScanResponse> scanMissingPanelFlow(@RequestBody(required = false) AiBulkScanRequest request) {
        AiBulkScanResponse response = comicPanelFlowService.startScanMissingPanelFlow(
                request != null ? request.getLibraryPathIds() : null
        );
        return ResponseEntity.ok(response);
    }

    @PostMapping("/stop-scan")
    public ResponseEntity<Void> stopScan() {
        comicPanelFlowService.requestStop();
        return ResponseEntity.noContent().build();
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception ex) {
            throw new IllegalArgumentException("Invalid panel flow payload.", ex);
        }
    }

    @SuppressWarnings("unchecked")
    private boolean isValidPanelFlowPayload(String payload) {
        try {
            Map<String, Object> root = objectMapper.readValue(payload, Map.class);
            Object pagesValue = root.get("pages");
            if (!(pagesValue instanceof Iterable<?> pages)) {
                return false;
            }

            for (Object pageObject : pages) {
                if (!(pageObject instanceof Map<?, ?> rawPage)) {
                    return false;
                }

                Object pageNumber = rawPage.get("pageNumber");
                Object panelsValue = rawPage.get("panels");

                if (!isPositiveInteger(pageNumber) || !(panelsValue instanceof Iterable<?> panels)) {
                    return false;
                }

                for (Object panelObject : panels) {
                    if (!(panelObject instanceof Map<?, ?> rawPanel)) {
                        return false;
                    }

                    if (!isNumeric(rawPanel.get("x"))
                            || !isNumeric(rawPanel.get("y"))
                            || !isNumeric(rawPanel.get("width"))
                            || !isNumeric(rawPanel.get("height"))) {
                        return false;
                    }

                    Object confidence = rawPanel.get("confidence");
                    if (confidence != null && !isNumeric(confidence)) {
                        return false;
                    }
                }
            }

            return true;
        } catch (Exception ex) {
            return false;
        }
    }

    private boolean isPositiveInteger(Object value) {
        if (value instanceof Number number) {
            return number.intValue() > 0;
        }

        if (value instanceof String text) {
            try {
                return Integer.parseInt(text) > 0;
            } catch (NumberFormatException ex) {
                return false;
            }
        }

        return false;
    }

    private boolean isNumeric(Object value) {
        if (value instanceof Number number) {
            return Double.isFinite(number.doubleValue());
        }

        if (value instanceof String text) {
            try {
                return Double.isFinite(Double.parseDouble(text));
            } catch (NumberFormatException ex) {
                return false;
            }
        }

        return false;
    }
}
