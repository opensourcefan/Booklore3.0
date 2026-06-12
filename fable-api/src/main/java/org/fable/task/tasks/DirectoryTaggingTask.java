package org.fable.task.tasks;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.fable.exception.ApiError;
import org.fable.model.dto.FableUser;
import org.fable.model.dto.request.TaskCreateRequest;
import org.fable.model.dto.response.TaskCreateResponse;
import org.fable.model.entity.LibraryEntity;
import org.fable.model.enums.TaskType;
import org.fable.model.enums.UserPermission;
import org.fable.model.websocket.TaskProgressPayload;
import org.fable.model.websocket.Topic;
import org.fable.repository.LibraryRepository;
import org.fable.service.NotificationService;
import org.fable.service.library.DirectoryTagQueueService;
import org.fable.service.library.DirectoryTagService;
import org.fable.task.TaskCancellationManager;
import org.fable.task.TaskStatus;
import org.fable.task.options.DirectoryTagTaskOptions;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

@Component
@RequiredArgsConstructor
@Slf4j
public class DirectoryTaggingTask implements Task {

    private final LibraryRepository libraryRepository;
    private final DirectoryTagQueueService directoryTagQueueService;
    private final DirectoryTagService directoryTagService;
    private final NotificationService notificationService;
    private final TaskCancellationManager cancellationManager;

    @Override
    public void validatePermissions(FableUser user, TaskCreateRequest request) {
        if (!UserPermission.CAN_ACCESS_TASK_MANAGER.isGranted(user.getPermissions())
                && !UserPermission.CAN_MANAGE_LIBRARY.isGranted(user.getPermissions())) {
            throw ApiError.PERMISSION_DENIED.createException(UserPermission.CAN_MANAGE_LIBRARY);
        }
    }

    @Override
    public TaskCreateResponse execute(TaskCreateRequest request) {
        String taskId = request.getTaskId() != null ? request.getTaskId() : UUID.randomUUID().toString();
        DirectoryTagTaskOptions options = request.getOptionsAs(DirectoryTagTaskOptions.class);
        if (options != null && options.getLibraryId() != null) {
            if (options.hasScopedBooks()) {
                directoryTagQueueService.enqueueBooks(options.getLibraryId(), options.getBookIds());
            } else {
                directoryTagQueueService.enqueueLibrary(options.getLibraryId());
            }
        } else {
            directoryTagQueueService.enqueueLibraries(findDirectoryTagLibraryIds());
        }

        AtomicInteger lastProgress = new AtomicInteger(0);
        AtomicInteger librariesCompleted = new AtomicInteger(0);
        AtomicInteger totalLibrariesSeen = new AtomicInteger(0);
        AtomicInteger totalBooksProcessed = new AtomicInteger(0);
        AtomicInteger totalBooksUpdated = new AtomicInteger(0);

        while (true) {
            if (cancellationManager.isTaskCancelled(taskId)) {
                sendProgress(taskId, lastProgress.get(), "Directory tagging cancelled", TaskStatus.CANCELLED, null, null);
                return TaskCreateResponse.builder()
                        .taskId(taskId)
                        .taskType(getTaskType())
                        .status(TaskStatus.CANCELLED)
                        .build();
            }

            List<DirectoryTagQueueService.PendingLibraryWork> pendingWork = directoryTagQueueService.drainPendingWork();
            if (pendingWork.isEmpty()) {
                break;
            }

            Map<Long, DirectoryTagQueueService.PendingLibraryWork> workByLibraryId = pendingWork.stream()
                    .collect(Collectors.toMap(DirectoryTagQueueService.PendingLibraryWork::libraryId, work -> work));

            List<LibraryEntity> libraries = libraryRepository.findByIdIn(new ArrayList<>(workByLibraryId.keySet())).stream()
                    .filter(LibraryEntity::isTagByDirectory)
                    .sorted(Comparator.comparing(LibraryEntity::getName, String.CASE_INSENSITIVE_ORDER))
                    .toList();
            if (libraries.isEmpty()) {
                continue;
            }

            totalLibrariesSeen.addAndGet(libraries.size());
            for (LibraryEntity library : libraries) {
                if (cancellationManager.isTaskCancelled(taskId)) {
                    sendProgress(taskId, lastProgress.get(), "Directory tagging cancelled", TaskStatus.CANCELLED, null, null);
                    return TaskCreateResponse.builder()
                            .taskId(taskId)
                            .taskType(getTaskType())
                            .status(TaskStatus.CANCELLED)
                            .build();
                }

                DirectoryTagQueueService.PendingLibraryWork work = workByLibraryId.get(library.getId());
                Set<Long> scopedBookIds = work != null && !work.fullLibrary() ? work.bookIds() : null;

                DirectoryTagService.DirectoryTagRunResult result = directoryTagService.applyMissingDirectoryTags(
                        library,
                    scopedBookIds,
                        snapshot -> {
                            int computedProgress = computeOverallProgress(snapshot, librariesCompleted.get(), totalLibrariesSeen.get());
                            int nextProgress = Math.max(lastProgress.get(), computedProgress);
                            lastProgress.set(nextProgress);
                            String message = buildProgressMessage(snapshot, totalLibrariesSeen.get() - librariesCompleted.get() - 1);
                            sendProgress(taskId, nextProgress, message, TaskStatus.IN_PROGRESS, snapshot.processedBooks(), snapshot.totalBooks());
                        },
                        () -> cancellationManager.isTaskCancelled(taskId)
                );

                librariesCompleted.incrementAndGet();
                totalBooksProcessed.addAndGet(result.totalBooks());
                totalBooksUpdated.addAndGet(result.updatedBooks());

                if (result.cancelled()) {
                    sendProgress(taskId, lastProgress.get(), "Directory tagging cancelled", TaskStatus.CANCELLED, null, null);
                    return TaskCreateResponse.builder()
                            .taskId(taskId)
                            .taskType(getTaskType())
                            .status(TaskStatus.CANCELLED)
                            .build();
                }
            }
        }

        String completionMessage;
        if (totalLibrariesSeen.get() == 0) {
            completionMessage = "No libraries with directory tagging enabled needed background tagging";
        } else {
            completionMessage = String.format(
                    "Directory tagging completed for %d book%s across %d librar%s",
                    totalBooksUpdated.get(),
                    totalBooksUpdated.get() == 1 ? "" : "s",
                    totalLibrariesSeen.get(),
                    totalLibrariesSeen.get() == 1 ? "y" : "ies"
            );
        }
        sendProgress(taskId, 100, completionMessage, TaskStatus.COMPLETED, totalBooksProcessed.get(), totalBooksProcessed.get());

        return TaskCreateResponse.builder()
                .taskId(taskId)
                .taskType(getTaskType())
                .status(TaskStatus.COMPLETED)
                .build();
    }

    @Override
    public TaskType getTaskType() {
        return TaskType.DIRECTORY_TAGGING;
    }

    private List<Long> findDirectoryTagLibraryIds() {
        return libraryRepository.findAll().stream()
                .filter(LibraryEntity::isTagByDirectory)
                .map(LibraryEntity::getId)
                .collect(Collectors.toList());
    }

    private int computeOverallProgress(DirectoryTagService.DirectoryTagProgressSnapshot snapshot, int librariesCompleted, int totalLibrariesSeen) {
        if (totalLibrariesSeen <= 0) {
            return snapshot.totalBooks() <= 0 ? 0 : Math.min(99, snapshot.processedBooks() * 100 / snapshot.totalBooks());
        }
        int libraryProgress = snapshot.totalBooks() <= 0 ? 100 : Math.min(100, snapshot.processedBooks() * 100 / snapshot.totalBooks());
        return Math.min(99, ((librariesCompleted * 100) + libraryProgress) / totalLibrariesSeen);
    }

    private String buildProgressMessage(DirectoryTagService.DirectoryTagProgressSnapshot snapshot, int queuedLibraries) {
        StringBuilder builder = new StringBuilder()
                .append("Tagging ")
                .append(snapshot.libraryName())
                .append(": ")
                .append(snapshot.processedBooks())
                .append("/")
                .append(snapshot.totalBooks())
                .append(" books");

        if (snapshot.estimatedRemainingMs() != null) {
            builder.append(" • about ").append(formatDuration(snapshot.estimatedRemainingMs())).append(" left");
        } else if (snapshot.processedBooks() < snapshot.totalBooks()) {
            builder.append(" • estimating time remaining");
        }

        if (queuedLibraries > 0) {
            builder.append(" • ").append(queuedLibraries).append(" librar").append(queuedLibraries == 1 ? "y" : "ies").append(" queued");
        }

        return builder.toString();
    }

    private String formatDuration(long durationMs) {
        long totalSeconds = Math.max(1L, Math.round(durationMs / 1000.0));
        long minutes = totalSeconds / 60;
        long seconds = totalSeconds % 60;
        if (minutes <= 0) {
            return seconds + "s";
        }
        if (minutes < 60) {
            return seconds == 0 ? minutes + "m" : minutes + "m " + seconds + "s";
        }
        long hours = minutes / 60;
        long remainingMinutes = minutes % 60;
        return remainingMinutes == 0 ? hours + "h" : hours + "h " + remainingMinutes + "m";
    }

    private void sendProgress(String taskId, int progress, String message, TaskStatus status, Integer currentStep, Integer totalSteps) {
        notificationService.sendMessage(Topic.TASK_PROGRESS, TaskProgressPayload.builder()
                .taskId(taskId)
                .taskType(getTaskType())
                .message(message)
                .progress(progress)
                .currentStep(currentStep)
                .totalSteps(totalSteps)
                .taskStatus(status)
                .build());
    }
}