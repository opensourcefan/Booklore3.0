package org.fable.task.tasks;

import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.fable.exception.APIException;
import org.fable.model.dto.FableUser;
import org.fable.model.dto.Library;
import org.fable.model.dto.request.TaskCreateRequest;
import org.fable.model.dto.response.TaskCreateResponse;
import org.fable.model.enums.TaskType;
import org.fable.service.library.LibraryRescanHelper;
import org.fable.service.library.LibraryService;
import org.fable.task.TaskCancellationManager;
import org.fable.task.options.LibraryRescanOptions;
import org.fable.task.options.RescanLibraryContext;
import org.springframework.dao.InvalidDataAccessApiUsageException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.util.List;

@AllArgsConstructor
@Component
@Slf4j
public class LibraryRescanTask implements Task {

    private final LibraryService libraryService;
    private final LibraryRescanHelper libraryRescanHelper;
    private final TaskCancellationManager cancellationManager;

    @Override
    public void validatePermissions(FableUser user, TaskCreateRequest request) {
        if (user.getPermissions() == null || !user.getPermissions().isCanAccessTaskManager()) {
            throw new APIException("You do not have permission to run this task", HttpStatus.FORBIDDEN);
        }
    }

    @Override
    public TaskCreateResponse execute(TaskCreateRequest request) {
        LibraryRescanOptions options = request.getOptionsAs(LibraryRescanOptions.class);
        String taskId = request.getTaskId();

        long startTime = System.currentTimeMillis();
        log.info("{}: Task started. TaskId: {}, Options: {}", getTaskType(), taskId, options);

        List<Library> libraries = libraryService.getAllLibraries();

        for (Library library : libraries) {
            if (cancellationManager.isTaskCancelled(taskId)) {
                log.info("{}: Task {} was cancelled, stopping execution", getTaskType(), taskId);
                break;
            }

            Long libraryId = library.getId();
            RescanLibraryContext context = RescanLibraryContext.builder()
                    .libraryId(libraryId)
                    .options(options)
                    .build();
            try {
                libraryRescanHelper.handleRescanOptions(context, taskId);
            } catch (InvalidDataAccessApiUsageException e) {
                log.debug("InvalidDataAccessApiUsageException - Library id: {}", libraryId);
            }
            log.info("{}: Library rescan completed for library: {}", getTaskType(), libraryId);
        }

        long endTime = System.currentTimeMillis();
        log.info("{}: Task completed. Duration: {} ms", getTaskType(), endTime - startTime);

        return null;
    }

    @Override
    public TaskType getTaskType() {
        return TaskType.REFRESH_LIBRARY_METADATA;
    }
}
