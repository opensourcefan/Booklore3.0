package org.booklore.service.ai;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.booklore.config.AppProperties;
import org.booklore.service.reader.CbxReaderService;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.ObjectMapper;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class AiPanelDetectionService {

    private static final int MAX_IMAGE_BYTES = 220_000;
    private static final int MAX_IMAGE_DIMENSION = 1100;
    private static final float JPEG_QUALITY = 0.68f;

    private final AppProperties appProperties;
    private final AiServiceEndpointResolver aiServiceEndpointResolver;
    private final CbxReaderService cbxReaderService;
    private final ObjectMapper objectMapper;

    public String detectPanelFlow(Long bookId, String bookType) {
        return detectPanelFlow(bookId, bookType, null);
    }

    public String detectPanelFlow(Long bookId, String bookType, AiPanelDetectionProgressListener progressListener) {
        List<Integer> pages = cbxReaderService.getAvailablePages(bookId, bookType);
        if (pages.isEmpty()) {
            throw new IllegalStateException("No pages available for AI panel detection.");
        }

        RestClient restClient = RestClient.builder()
                .requestFactory(buildRequestFactory())
                .build();

        String endpoint = aiServiceEndpointResolver.resolveBaseUrl(restClient) + "/v1/panel-detection/scan";

        List<Map<String, Object>> detectedPages = new ArrayList<>(pages.size());
        int pagesWithPanels = 0;
        int requestFailures = 0;
        int totalPanelsFound = 0;

        if (progressListener != null) {
            progressListener.onScanStarted(pages.size());
        }

        for (Integer pageNumber : pages) {
            if (progressListener != null && progressListener.shouldStop()) {
                throw new ScanStoppedException();
            }
            Map<String, Object> payload = new HashMap<>();
            payload.put("bookId", bookId);
            payload.put("bookType", bookType);
            payload.put("requestedAt", Instant.now().toString());
            payload.put("scanMode", "single-page");

            Map<String, Object> pagePayload = new HashMap<>();
            pagePayload.put("pageNumber", pageNumber);
            String imageBase64 = loadPageAsBase64(bookId, bookType, pageNumber);
            if (imageBase64 != null && !imageBase64.isBlank()) {
                pagePayload.put("imageBase64", imageBase64);
            }
            payload.put("pages", List.of(pagePayload));

            Map<String, Object> rawResponse;
            try {
                String rawJson = postScan(restClient, endpoint, payload);

                if (rawJson == null || rawJson.isBlank()) {
                    requestFailures++;
                    log.warn("AI panel detection returned empty body for book {} page {}", bookId, pageNumber);
                    continue;
                }

                @SuppressWarnings("unchecked")
                Map<String, Object> response = objectMapper.readValue(rawJson, Map.class);
                rawResponse = response;
            } catch (Exception ex) {
                if (pagePayload.containsKey("imageBase64")) {
                    try {
                        Map<String, Object> fallbackPayload = new HashMap<>();
                        fallbackPayload.put("bookId", bookId);
                        fallbackPayload.put("bookType", bookType);
                        fallbackPayload.put("requestedAt", Instant.now().toString());
                        fallbackPayload.put("scanMode", "single-page-pageNumber-only-fallback-after-error");
                        fallbackPayload.put("pages", List.of(Map.of("pageNumber", pageNumber)));

                        String fallbackJson = postScan(restClient, endpoint, fallbackPayload);
                        if (fallbackJson == null || fallbackJson.isBlank()) {
                            requestFailures++;
                            log.warn("AI panel fallback returned empty body for book {} page {}", bookId, pageNumber);
                            continue;
                        }

                        @SuppressWarnings("unchecked")
                        Map<String, Object> fallbackRaw = objectMapper.readValue(fallbackJson, Map.class);
                        rawResponse = fallbackRaw;
                    } catch (Exception fallbackEx) {
                        requestFailures++;
                        log.warn("AI panel detection request and fallback failed for book {} page {}", bookId, pageNumber, fallbackEx);
                        continue;
                    }
                } else {
                    requestFailures++;
                    log.warn("AI panel detection request failed for book {} page {}", bookId, pageNumber, ex);
                    continue;
                }
            }

            Map<String, Object> response = normalizeResponse(rawResponse);
            List<Map<String, Object>> panels = extractPanelsForPage(response, pageNumber);
            if (panels.isEmpty() && pagePayload.containsKey("imageBase64")) {
                try {
                    Map<String, Object> fallbackPayload = new HashMap<>();
                    fallbackPayload.put("bookId", bookId);
                    fallbackPayload.put("bookType", bookType);
                    fallbackPayload.put("requestedAt", Instant.now().toString());
                    fallbackPayload.put("scanMode", "single-page-pageNumber-only-fallback");
                    fallbackPayload.put("pages", List.of(Map.of("pageNumber", pageNumber)));

                    String fallbackJson = postScan(restClient, endpoint, fallbackPayload);
                    if (fallbackJson != null && !fallbackJson.isBlank()) {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> fallbackRaw = objectMapper.readValue(fallbackJson, Map.class);
                        response = normalizeResponse(fallbackRaw);
                        panels = extractPanelsForPage(response, pageNumber);
                    }
                } catch (Exception ex) {
                    log.warn("AI panel fallback request failed for book {} page {}", bookId, pageNumber, ex);
                }
            }
            if (!panels.isEmpty()) {
                pagesWithPanels++;
            }
            totalPanelsFound += panels.size();

            Map<String, Object> pageResult = new HashMap<>();
            pageResult.put("pageNumber", pageNumber);
            pageResult.put("panels", panels);
            detectedPages.add(pageResult);

            if (progressListener != null) {
                progressListener.onPageProcessed(pageNumber, detectedPages.size(), pages.size(), panels.size(), totalPanelsFound, pagesWithPanels);
            }
        }

        if (pagesWithPanels == 0) {
            throw new IllegalStateException("AI service returned no detected panels. requestedPages=" + pages.size() + ", returnedPages=0, requestFailures=" + requestFailures);
        }

        if (progressListener != null) {
            progressListener.onScanCompleted(detectedPages.size(), pages.size(), totalPanelsFound, pagesWithPanels);
        }

        Map<String, Object> aggregated = new HashMap<>();
        aggregated.put("source", "ai-panel-detection");
        aggregated.put("generatedAt", Instant.now().toString());
        aggregated.put("pageCount", pages.size());
        aggregated.put("requestFailures", requestFailures);
        aggregated.put("pages", detectedPages);

        try {
            return objectMapper.writeValueAsString(aggregated);
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to serialize AI panel detection response.", ex);
        }
    }

    private String postScan(RestClient restClient, String endpoint, Map<String, Object> payload) {
        return restClient.post()
                .uri(endpoint)
                .contentType(MediaType.APPLICATION_JSON)
                .body(payload)
                .retrieve()
                .body(String.class);
    }

    private String loadPageAsBase64(Long bookId, String bookType, int pageNumber) {
        try {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            cbxReaderService.streamPageImage(bookId, bookType, pageNumber, out);
            byte[] imageBytes = out.toByteArray();

            if (imageBytes.length > MAX_IMAGE_BYTES) {
                byte[] compressed = compressImageForAi(imageBytes);
                if (compressed != null && compressed.length > 0) {
                    imageBytes = compressed;
                } else {
                    // If compression fails, fall back to page-number only payload.
                    return null;
                }
            }

            return Base64.getEncoder().encodeToString(imageBytes);
        } catch (Exception ex) {
            log.error("Failed to load page {} for book {}", pageNumber, bookId, ex);
            return null;
        }
    }

    private byte[] compressImageForAi(byte[] source) {
        try {
            BufferedImage original = ImageIO.read(new ByteArrayInputStream(source));
            if (original == null) {
                return null;
            }

            int width = original.getWidth();
            int height = original.getHeight();
            double scale = Math.min(1.0d, (double) MAX_IMAGE_DIMENSION / Math.max(width, height));

            BufferedImage working = original;
            if (scale < 1.0d) {
                int targetW = Math.max(1, (int) Math.round(width * scale));
                int targetH = Math.max(1, (int) Math.round(height * scale));
                BufferedImage resized = new BufferedImage(targetW, targetH, BufferedImage.TYPE_INT_RGB);
                Graphics2D g = resized.createGraphics();
                g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
                g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
                g.drawImage(original, 0, 0, targetW, targetH, null);
                g.dispose();
                working = resized;
            }

            Iterator<ImageWriter> writers = ImageIO.getImageWritersByFormatName("jpg");
            if (!writers.hasNext()) {
                return null;
            }

            ImageWriter writer = writers.next();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            try (MemoryCacheImageOutputStream ios = new MemoryCacheImageOutputStream(out)) {
                writer.setOutput(ios);
                ImageWriteParam writeParam = writer.getDefaultWriteParam();
                if (writeParam.canWriteCompressed()) {
                    writeParam.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
                    writeParam.setCompressionQuality(JPEG_QUALITY);
                }
                writer.write(null, new IIOImage(working, null, null), writeParam);
            } finally {
                writer.dispose();
            }

            return out.toByteArray();
        } catch (Exception ex) {
            log.warn("Failed to compress image for AI panel detection.", ex);
            return null;
        }
    }

    private List<Map<String, Object>> extractPanelsForPage(Map<String, Object> response, int pageNumber) {
        if (response == null) {
            return List.of();
        }

        List<?> pages = asObjectList(response.get("pages"));
        if (!pages.isEmpty()) {
            for (Object pageObj : pages) {
                Map<String, Object> pageMap = toMap(pageObj);
                if (pageMap == null) {
                    continue;
                }

                int responsePage = toInt(pageMap.get("pageNumber"), -1);
                if (responsePage == pageNumber || responsePage == -1) {
                    List<Map<String, Object>> panels = asPanelList(pageMap.get("panels"));
                    if (!panels.isEmpty()) return panels;

                    panels = asPanelList(pageMap.get("detections"));
                    if (!panels.isEmpty()) return panels;

                    panels = asPanelList(pageMap.get("boxes"));
                    if (!panels.isEmpty()) return panels;
                }
            }
        }

        List<Map<String, Object>> panels = asPanelList(response.get("panels"));
        if (!panels.isEmpty()) {
            return panels;
        }

        panels = asPanelList(response.get("detections"));
        if (!panels.isEmpty()) {
            return panels;
        }

        return asPanelList(response.get("boxes"));
    }

    private List<Map<String, Object>> asPanelList(Object value) {
        List<?> rawList = asObjectList(value);
        if (rawList.isEmpty()) {
            return List.of();
        }

        List<Map<String, Object>> panels = new ArrayList<>();
        for (Object item : rawList) {
            Map<String, Object> panel = toMap(item);
            if (panel != null && !panel.isEmpty()) {
                panels.add(panel);
            }
        }
        return panels;
    }

    private List<?> asObjectList(Object value) {
        if (value == null) {
            return List.of();
        }

        if (value instanceof List<?> list) {
            return list;
        }

        try {
            List<?> converted = objectMapper.convertValue(value, List.class);
            return converted != null ? converted : List.of();
        } catch (Exception ignored) {
            return List.of();
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> toMap(Object value) {
        if (value == null) {
            return null;
        }

        if (value instanceof Map<?, ?> mapValue) {
            return (Map<String, Object>) mapValue;
        }

        try {
            return objectMapper.convertValue(value, Map.class);
        } catch (Exception ignored) {
            return null;
        }
    }

    private int toInt(Object value, int fallback) {
        if (value instanceof Number n) {
            return n.intValue();
        }
        if (value instanceof String s) {
            try {
                return Integer.parseInt(s);
            } catch (NumberFormatException ignored) {
                return fallback;
            }
        }
        return fallback;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> normalizeResponse(Map<String, Object> rawResponse) {
        if (rawResponse == null) {
            return null;
        }

        if (rawResponse.get("pages") instanceof List<?>) {
            return rawResponse;
        }

        Object dataObj = rawResponse.get("data");
        if (dataObj instanceof Map<?, ?> dataMap) {
            return objectMapper.convertValue(dataMap, Map.class);
        }

        if (dataObj instanceof String dataStr) {
            try {
                return objectMapper.readValue(dataStr, Map.class);
            } catch (Exception ex) {
                log.warn("Failed to parse AI response data string as JSON.", ex);
            }
        }

        Object resultObj = rawResponse.get("result");
        if (resultObj instanceof Map<?, ?> resultMap) {
            return objectMapper.convertValue(resultMap, Map.class);
        }

        return rawResponse;
    }

    private SimpleClientHttpRequestFactory buildRequestFactory() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(appProperties.getAi().getConnectTimeoutMs());
        factory.setReadTimeout(appProperties.getAi().getReadTimeoutMs());
        return factory;
    }

    public interface AiPanelDetectionProgressListener {
        void onScanStarted(int totalPages);

        void onPageProcessed(int pageNumber, int processedPages, int totalPages, int pagePanelsFound, int totalPanelsFound, int pagesWithPanels);

        void onScanCompleted(int processedPages, int totalPages, int totalPanelsFound, int pagesWithPanels);

        default boolean shouldStop() {
            return false;
        }
    }

    public static class ScanStoppedException extends RuntimeException {
        public ScanStoppedException() {
            super("Scan stopped by user.");
        }
    }
}
