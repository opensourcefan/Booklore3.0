package org.fable.task.tasks;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.fable.config.security.service.AuthenticationService;
import org.fable.model.dto.FableUser;
import org.fable.model.dto.MetadataBatchProgressNotification;
import org.fable.model.dto.request.IsbnDiscoveryRequest;
import org.fable.model.dto.request.TaskCreateRequest;
import org.fable.model.dto.response.TaskCreateResponse;
import org.fable.model.entity.MetadataFetchJobEntity;
import org.fable.model.entity.MetadataFetchProposalEntity;
import org.fable.model.enums.FetchedMetadataProposalStatus;
import org.fable.model.enums.MetadataFetchTaskStatus;
import org.fable.model.enums.TaskType;
import org.fable.model.websocket.Topic;
import org.fable.repository.MetadataFetchJobRepository;
import org.fable.service.NotificationService;
import org.fable.service.metadata.IsbnMetadataFillService;
import org.fable.task.TaskCancellationManager;
import org.fable.task.TaskStatus;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Set;

import static org.fable.exception.ApiError.PERMISSION_DENIED;
import static org.fable.model.enums.UserPermission.CAN_BULK_AUTO_FETCH_METADATA;

/**
 * Two-phase ISBN batch skeleton:
 * discover when needed, then multi-pass fill per book via {@link IsbnMetadataFillService}.
 * Outcomes with reviewable metadata become proposals (same review dialog as metadata refresh).
 * Hard failures (no ISBN found) are reported in the task message without a fake review queue.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class IsbnDiscoveryTask implements Task {

    private final IsbnMetadataFillService isbnMetadataFillService;
    private final MetadataFetchJobRepository metadataFetchJobRepository;
    private final NotificationService notificationService;
    private final AuthenticationService authenticationService;
    private final TaskCancellationManager cancellationManager;
    private final ObjectMapper objectMapper;

    @Override
    public void validatePermissions(FableUser user, TaskCreateRequest request) {
        IsbnDiscoveryRequest options = request.getOptionsAs(IsbnDiscoveryRequest.class);
        if (options != null && options.getBookIds() != null && options.getBookIds().size() > 1
                && !CAN_BULK_AUTO_FETCH_METADATA.isGranted(user.getPermissions())) {
            throw PERMISSION_DENIED.createException(CAN_BULK_AUTO_FETCH_METADATA);
        }
    }

    @Override
    public TaskCreateResponse execute(TaskCreateRequest request) {
        IsbnDiscoveryRequest options = request.getOptionsAs(IsbnDiscoveryRequest.class);
        Set<Long> bookIds = options != null && options.getBookIds() != null ? options.getBookIds() : Set.of();
        String taskId = request.getTaskId();

        FableUser user = authenticationService.getAuthenticatedUser();
        Long userId = user != null ? user.getId() : null;

        MetadataFetchJobEntity job = MetadataFetchJobEntity.builder()
                .taskId(taskId)
                .userId(userId)
                .status(MetadataFetchTaskStatus.IN_PROGRESS)
                .startedAt(Instant.now())
                .totalBooksCount(bookIds.size())
                .completedBooks(0)
                .requestedBookIds(new ArrayList<>(bookIds))
                .build();
        metadataFetchJobRepository.save(job);

        int completed = 0;
        int reviewCount = 0;
        int failedCount = 0;
        for (Long bookId : bookIds) {
            if (cancellationManager.isTaskCancelled(taskId)) {
                job.setStatus(MetadataFetchTaskStatus.CANCELLED);
                job.setCompletedAt(Instant.now());
                job.setStatusMessage("Task cancelled by user");
                metadataFetchJobRepository.save(job);
                sendProgress(taskId, completed, bookIds.size(), "Cancelled", MetadataFetchTaskStatus.CANCELLED, reviewCount > 0);
                cancellationManager.clearCancellation(taskId);
                return TaskCreateResponse.builder()
                        .taskType(TaskType.ISBN_DISCOVERY)
                        .taskId(taskId)
                        .status(TaskStatus.CANCELLED)
                        .build();
            }

            try {
                IsbnMetadataFillService.IsbnFillOutcome outcome = isbnMetadataFillService.fillBookFromIsbn(bookId);
                if (outcome.status() == IsbnMetadataFillService.IsbnFillOutcome.Status.NEEDS_REVIEW
                        && outcome.metadata() != null) {
                    MetadataFetchProposalEntity proposal = MetadataFetchProposalEntity.builder()
                            .job(job)
                            .bookId(bookId)
                            .metadataJson(objectMapper.writeValueAsString(outcome.metadata()))
                            .status(FetchedMetadataProposalStatus.FETCHED)
                            .fetchedAt(Instant.now())
                            .build();
                    job.getProposals().add(proposal);
                    reviewCount++;
                } else if (outcome.status() == IsbnMetadataFillService.IsbnFillOutcome.Status.ERROR
                        || outcome.status() == IsbnMetadataFillService.IsbnFillOutcome.Status.DISABLED) {
                    failedCount++;
                    log.info("ISBN discovery did not fill book {}: {}", bookId, outcome.message());
                }
                completed++;
                job.setCompletedBooks(completed);
                job.setStatusMessage(buildProgressMessage(bookId, outcome));
                metadataFetchJobRepository.save(job);
                sendProgress(taskId, completed, bookIds.size(),
                        job.getStatusMessage(),
                        MetadataFetchTaskStatus.IN_PROGRESS,
                        reviewCount > 0);
            } catch (Exception e) {
                log.error("ISBN discovery failed for book {}", bookId, e);
                completed++;
                failedCount++;
                sendProgress(taskId, completed, bookIds.size(),
                        "Failed book " + bookId + ": " + e.getMessage(),
                        MetadataFetchTaskStatus.IN_PROGRESS,
                        reviewCount > 0);
            }
        }

        job.setStatus(MetadataFetchTaskStatus.COMPLETED);
        job.setCompletedAt(Instant.now());
        job.setCompletedBooks(completed);
        String finalMessage = buildFinalMessage(reviewCount, failedCount, completed);
        job.setStatusMessage(finalMessage);
        metadataFetchJobRepository.save(job);

        // Mirror MetadataTaskService.getActiveTasks semantics so the Review button stays visible:
        // completed = accepted count (0), total = pending FETCHED proposals.
        if (reviewCount > 0) {
            sendProgress(taskId, 0, reviewCount, finalMessage, MetadataFetchTaskStatus.COMPLETED, true);
        } else {
            sendProgress(taskId, completed, bookIds.size(), finalMessage, MetadataFetchTaskStatus.COMPLETED, false);
        }

        return TaskCreateResponse.builder()
                .taskType(TaskType.ISBN_DISCOVERY)
                .taskId(taskId)
                .status(TaskStatus.COMPLETED)
                .build();
    }

    private static String buildProgressMessage(Long bookId, IsbnMetadataFillService.IsbnFillOutcome outcome) {
        return "Book " + bookId + ": " + outcome.status()
                + (outcome.message() != null ? " — " + outcome.message() : "");
    }

    private static String buildFinalMessage(int reviewCount, int failedCount, int completed) {
        if (reviewCount > 0) {
            return String.format(
                    "ISBN discovery completed. %d book(s) need review%s.",
                    reviewCount,
                    failedCount > 0 ? ", " + failedCount + " failed" : "");
        }
        if (failedCount > 0) {
            return String.format(
                    "ISBN discovery completed with %d failure(s) of %d. No reviewable proposals were created (often: no ISBN in front matter).",
                    failedCount, completed);
        }
        return "ISBN discovery completed. Metadata applied automatically.";
    }

    private void sendProgress(String taskId, int completed, int total, String message,
                              MetadataFetchTaskStatus status, boolean review) {
        notificationService.sendMessage(
                Topic.BOOK_METADATA_BATCH_PROGRESS,
                new MetadataBatchProgressNotification(taskId, completed, total, message, status.name(), review));
    }

    @Override
    public TaskType getTaskType() {
        return TaskType.ISBN_DISCOVERY;
    }
}
