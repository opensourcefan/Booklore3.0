package org.booklore.controller;

import lombok.RequiredArgsConstructor;
import org.booklore.model.dto.ai.AiServiceStatus;
import org.booklore.service.ai.AiServiceHealthService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/v1/ai")
public class AiController {

    private final AiServiceHealthService aiServiceHealthService;

    @GetMapping("/status")
    public AiServiceStatus getStatus() {
        return aiServiceHealthService.getStatus();
    }

    @PostMapping("/reload")
    public Map<String, Object> reload() {
        return aiServiceHealthService.triggerReload();
    }
}
