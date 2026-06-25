package org.fable.service;

import org.fable.model.entity.LogNotificationEntity;
import org.fable.model.websocket.LogNotification;
import org.fable.model.websocket.Severity;
import org.fable.repository.LogNotificationRepository;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@AllArgsConstructor
public class LogNotificationService {

    private final LogNotificationRepository repository;

    @Transactional
    public LogNotificationEntity persist(String message, Severity severity) {
        LogNotificationEntity entity = LogNotificationEntity.builder()
                .message(message)
                .severity(severity)
                .createdAt(Instant.now())
                .build();
        LogNotificationEntity saved = repository.save(entity);
        log.debug("Persisted log notification id={} severity={}", saved.getId(), severity);
        return saved;
    }

    @Transactional(readOnly = true)
    public List<LogNotification> getRecentNotifications(int maxResults) {
        Instant since = Instant.now().minus(24, ChronoUnit.HOURS);
        return repository.findByCreatedAtAfterOrderByCreatedAtDesc(since, PageRequest.of(0, maxResults))
                .stream()
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    @Transactional
    public void deleteAllNotifications() {
        repository.deleteAll();
        log.info("Deleted all log notifications");
    }

    private LogNotification toDto(LogNotificationEntity entity) {
        return new LogNotification(entity.getMessage(), entity.getSeverity());
    }
}
