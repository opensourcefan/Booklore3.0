package org.fable.service.library;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.fable.exception.APIException;
import org.fable.model.dto.request.TaskCreateRequest;
import org.fable.model.enums.TaskType;
import org.fable.service.task.TaskService;
import org.fable.task.options.DirectoryTagTaskOptions;
import org.springframework.http.HttpStatus;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import java.util.Set;
import java.util.TreeSet;

@Service
@RequiredArgsConstructor
@Slf4j
public class DirectoryTagTaskStarter {

    private final DirectoryTagQueueService directoryTagQueueService;
    private final ObjectProvider<TaskService> taskServiceProvider;

    public void scheduleLibrary(long libraryId) {
        directoryTagQueueService.enqueueLibrary(libraryId);
        startIfNeeded(DirectoryTagTaskOptions.builder().libraryId(libraryId).build());
    }

    public void scheduleBooks(long libraryId, Set<Long> bookIds) {
        if (bookIds == null || bookIds.isEmpty()) {
            return;
        }

        Set<Long> normalizedBookIds = new TreeSet<>(bookIds);
        directoryTagQueueService.enqueueBooks(libraryId, normalizedBookIds);
        startIfNeeded(DirectoryTagTaskOptions.builder()
                .libraryId(libraryId)
                .bookIds(normalizedBookIds)
                .build());
    }

    private void startIfNeeded(DirectoryTagTaskOptions options) {
        try {
            taskServiceProvider.getObject().runAsUser(TaskCreateRequest.builder()
                    .taskType(TaskType.DIRECTORY_TAGGING)
                    .options(options)
                    .build());
        } catch (APIException e) {
            if (e.getStatus() == HttpStatus.CONFLICT) {
                log.debug("Directory tagging task already running; queued work will be picked up by the current task");
                return;
            }
            throw e;
        }
    }
}