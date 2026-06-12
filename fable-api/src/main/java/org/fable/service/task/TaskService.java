package org.fable.service.task;

import lombok.extern.slf4j.Slf4j;
import org.fable.config.security.service.AuthenticationService;
import org.fable.exception.APIException;
import org.fable.model.dto.FableUser;
import org.fable.model.dto.TaskInfo;
import org.fable.model.dto.request.TaskCreateRequest;
import org.fable.model.dto.response.TaskCancelResponse;
import org.fable.model.dto.response.TaskCreateResponse;
import org.fable.model.entity.TaskCronConfigurationEntity;
import org.fable.model.enums.TaskType;
import org.fable.task.TaskCancellationManager;
import org.fable.task.TaskStatus;
import org.fable.task.tasks.Task;
import org.fable.service.user.UserService;
import org.fable.service.NotificationService;
import org.fable.model.websocket.LogNotification;
import org.fable.model.websocket.Topic;
import org.fable.util.SecurityContextVirtualThread;
import org.springframework.context.annotation.Lazy;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.support.CronTrigger;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.Executor;
import java.util.concurrent.ScheduledFuture;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@Slf4j
public class TaskService {

    private final AuthenticationService authenticationService;
    private final TaskHistoryService taskHistoryService;
    private final TaskCronService taskCronService;
    private final UserService userService;
    private final NotificationService notificationService;
    private final Map<TaskType, Task> taskRegistry;
    private final ConcurrentMap<TaskType, String> runningTasks = new ConcurrentHashMap<>();
    private final TaskCancellationManager cancellationManager;
    private final Executor taskExecutor;
    private final ObjectMapper objectMapper;
    private final TaskScheduler taskScheduler;
    private final Map<TaskType, ScheduledFuture<?>> scheduledTasks = new ConcurrentHashMap<>();

    public TaskService(
            AuthenticationService authenticationService,
            TaskHistoryService taskHistoryService,
            @Lazy TaskCronService taskCronService,
            @Lazy UserService userService,
            NotificationService notificationService,
            List<Task> tasks,
            TaskCancellationManager cancellationManager,
            Executor taskExecutor,
            ObjectMapper objectMapper,
            TaskScheduler taskScheduler) {
        this.authenticationService = authenticationService;
        this.taskHistoryService = taskHistoryService;
        this.taskCronService = taskCronService;
        this.userService = userService;
        this.notificationService = notificationService;
        this.taskRegistry = tasks.stream().collect(Collectors.toMap(Task::getTaskType, Function.identity()));
        this.cancellationManager = cancellationManager;
        this.taskExecutor = taskExecutor;
        this.objectMapper = objectMapper;
        this.taskScheduler = taskScheduler;
    }

    public void initializeScheduledTasks() {
        List<TaskCronConfigurationEntity> enabledConfigs = taskCronService.getAllEnabledCronConfigs();
        log.info("Initializing {} scheduled tasks", enabledConfigs.size());
        enabledConfigs.forEach(this::scheduleTask);
    }

    public void rescheduleTask(TaskType taskType) {
        cancelScheduledTask(taskType);
        taskCronService.getCronConfigOrDefault(taskType);
        var cronConfig = taskCronService.getCronConfigOrDefault(taskType);

        if (cronConfig.getEnabled() != null && cronConfig.getEnabled() && cronConfig.getCronExpression() != null) {
            TaskCronConfigurationEntity config = TaskCronConfigurationEntity.builder()
                    .taskType(taskType)
                    .cronExpression(cronConfig.getCronExpression())
                    .enabled(cronConfig.getEnabled())
                    .build();
            scheduleTask(config);
        }
    }

    private void scheduleTask(TaskCronConfigurationEntity config) {
        cancelScheduledTask(config.getTaskType());

        try {
            CronTrigger trigger = new CronTrigger(config.getCronExpression());
            ScheduledFuture<?> scheduledTask = taskScheduler.schedule(
                    () -> executeCronTask(config.getTaskType()),
                    trigger
            );

            scheduledTasks.put(config.getTaskType(), scheduledTask);
            log.info("Scheduled task {} with cron expression: {}", config.getTaskType(), config.getCronExpression());
        } catch (Exception e) {
            log.error("Failed to schedule task {}", config.getTaskType(), e);
        }
    }

    private void cancelScheduledTask(TaskType taskType) {
        ScheduledFuture<?> scheduledTask = scheduledTasks.remove(taskType);
        if (scheduledTask != null && !scheduledTask.isCancelled()) {
            scheduledTask.cancel(false);
            log.info("Cancelled scheduled task: {}", taskType);
        }
    }

    public List<TaskInfo> getAvailableTasks() {
        return Arrays.stream(TaskType.values())
                .filter(taskType -> !taskType.isHiddenFromUI())
                .map(taskType -> {
                    TaskInfo metadata = TaskInfo.fromTaskType(taskType);
                    Task task = taskRegistry.get(taskType);
                    if (task != null) {
                        metadata.setMetadata(task.getMetadata());
                    }
                    if (taskType.isCronSupported()) {
                        var cronConfig = taskCronService.getCronConfigOrDefault(taskType);
                        metadata.setCronConfig(cronConfig);
                    }
                    return metadata;
                })
                .collect(Collectors.toList());
    }

    public void executeCronTask(TaskType taskType) {
        log.info("Executing cron-scheduled task: {}", taskType);
        try {
            FableUser executionUser = authenticationService.getSystemUser();
            var configOpt = taskCronService.getCronConfigEntity(taskType);
            if (configOpt.isPresent()) {
                Long createdBy = configOpt.get().getCreatedBy();
                if (createdBy != null && createdBy != -1L) {
                    try {
                        executionUser = userService.getFableUser(createdBy);
                    } catch (Exception e) {
                        log.warn("Could not find configuring user with ID {}, falling back to System User", createdBy);
                    }
                }
            }

            UsernamePasswordAuthenticationToken authentication = new UsernamePasswordAuthenticationToken(executionUser, null, List.of());
            SecurityContext securityContext = SecurityContextHolder.createEmptyContext();
            securityContext.setAuthentication(authentication);
            SecurityContextHolder.setContext(securityContext);

            TaskCreateRequest request = TaskCreateRequest.builder()
                    .taskType(taskType)
                    .triggeredByCron(true)
                    .build();

            runAsExecutionUser(request, executionUser);
        } catch (Exception e) {
            log.error("Failed to execute cron-scheduled task: {}", taskType, e);
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    public TaskCreateResponse runAsUser(TaskCreateRequest request) {
        if (request == null || request.getTaskType() == null) {
            throw new APIException("Task request and task type cannot be null", HttpStatus.BAD_REQUEST);
        }
        FableUser user = authenticationService.getAuthenticatedUser();
        TaskType taskType = request.getTaskType();
        if (taskType.isAsync()) {
            return runAsync(request, user, taskType);
        } else {
            return runSync(request, user, taskType);
        }
    }

    private void runAsExecutionUser(TaskCreateRequest request, FableUser user) {
        if (request == null || request.getTaskType() == null) {
            throw new APIException("Task request and task type cannot be null", HttpStatus.BAD_REQUEST);
        }
        TaskType taskType = request.getTaskType();
        if (taskType.isAsync()) {
            runAsync(request, user, taskType);
        } else {
            runSync(request, user, taskType);
        }
    }

    private TaskCreateResponse runAsync(TaskCreateRequest request, FableUser user, TaskType taskType) {
        String taskId = initializeTask(request, user, taskType);
        TaskCreateResponse response = TaskCreateResponse.builder()
                .taskId(taskId)
                .taskType(taskType)
                .status(TaskStatus.ACCEPTED)
                .build();
        SecurityContext securityContext = SecurityContextHolder.getContext();
        taskExecutor.execute(() ->
                SecurityContextVirtualThread.runWithSecurityContext(securityContext, () ->
                        executeAsyncTask(taskId, request, taskType, user)
                )
        );
        return response;
    }

    public TaskCancelResponse cancelTask(String taskId) {
        FableUser user = authenticationService.getAuthenticatedUser();
        boolean isRunning = runningTasks.containsValue(taskId);
        if (!isRunning) {
            throw new APIException("Task not found or not running: " + taskId, HttpStatus.NOT_FOUND);
        }
        cancellationManager.cancelTask(taskId);
        taskHistoryService.updateTaskStatus(taskId, TaskStatus.CANCELLED, "Task cancellation requested by user");
        log.info("Task {} cancellation requested by user {}", taskId, user.getUsername());
        return TaskCancelResponse.builder()
                .taskId(taskId)
                .cancelled(true)
                .message("Task cancellation requested. The task will stop at the next checkpoint.")
                .build();
    }

    public boolean isTaskRunning(String taskId) {
        return runningTasks.containsValue(taskId);
    }

    private void executeAsyncTask(String taskId, TaskCreateRequest request, TaskType taskType, FableUser user) {
        try {
            taskHistoryService.updateTaskStatus(taskId, TaskStatus.IN_PROGRESS, "Task execution started");
            request.setTaskId(taskId);
            if (cancellationManager.isTaskCancelled(taskId)) {
                log.info("Task {} was cancelled before execution", taskId);
                taskHistoryService.updateTaskStatus(taskId, TaskStatus.CANCELLED, "Task was cancelled");
                return;
            }
            executeTask(request);
            if (cancellationManager.isTaskCancelled(taskId)) {
                log.info("Task {} was cancelled during execution", taskId);
                taskHistoryService.updateTaskStatus(taskId, TaskStatus.CANCELLED, "Task was cancelled");
            } else {
                taskHistoryService.updateTaskStatus(taskId, TaskStatus.COMPLETED, "Task completed successfully");
                if (request.isTriggeredByCron()) {
                    sendCronNotification(taskType, user, true, null);
                }
            }
        } catch (Exception e) {
            log.error("Async task {} of type {} failed", taskId, taskType, e);
            taskHistoryService.updateTaskError(taskId, e.getMessage());
            if (request.isTriggeredByCron()) {
                sendCronNotification(taskType, user, false, e.getMessage());
            }
        } finally {
            if (!taskType.isParallel()) {
                runningTasks.remove(taskType);
            }
            cancellationManager.clearCancellation(taskId);
        }
    }

    private TaskCreateResponse runSync(TaskCreateRequest request, FableUser user, TaskType taskType) {
        String taskId = initializeTask(request, user, taskType);
        try {
            taskHistoryService.updateTaskStatus(taskId, TaskStatus.IN_PROGRESS, "Task execution started");
            request.setTaskId(taskId);
            TaskCreateResponse response = executeTask(request);
            response.setTaskId(taskId);
            taskHistoryService.updateTaskStatus(taskId, TaskStatus.COMPLETED, "Task completed successfully");
            if (request.isTriggeredByCron()) {
                sendCronNotification(taskType, user, true, null);
            }
            return response;
        } catch (Exception e) {
            log.error("Sync task {} of type {} failed", taskId, taskType, e);
            taskHistoryService.updateTaskError(taskId, e.getMessage());
            if (request.isTriggeredByCron()) {
                sendCronNotification(taskType, user, false, e.getMessage());
            }
            throw e;
        } finally {
            if (!taskType.isParallel()) {
                runningTasks.remove(taskType);
            }
        }
    }

    private void sendCronNotification(TaskType taskType, FableUser user, boolean success, String errorDetail) {
        try {
            var configOpt = taskCronService.getCronConfigEntity(taskType);
            if (configOpt.isPresent() && !configOpt.get().getNotificationsEnabled()) {
                return;
            }

            String status = success ? "completed successfully" : "failed" + (errorDetail != null ? ": " + errorDetail : "");
            String message = "Cron task " + taskType + " " + status;
            LogNotification logNotification = success 
                    ? LogNotification.info(message) 
                    : LogNotification.error(message);

            if (user != null && user.getId() != null && user.getId() != -1L) {
                notificationService.sendMessageToUser(user.getUsername(), Topic.LOG, logNotification);
            } else {
                notificationService.sendMessageToPermissions(Topic.LOG, logNotification,
                        java.util.Set.of(org.fable.model.enums.PermissionType.ADMIN, org.fable.model.enums.PermissionType.MANAGE_LIBRARY));
            }
        } catch (Exception e) {
            log.error("Failed to send cron notification for task type: {}", taskType, e);
        }
    }

    private String initializeTask(TaskCreateRequest request, FableUser user, TaskType taskType) {
        Task task = taskRegistry.get(taskType);
        if (task != null) {
            task.validatePermissions(user, request);
        }

        if (!taskType.isParallel()) {
            String existingTaskId = runningTasks.putIfAbsent(taskType, "");
            if (existingTaskId != null) {
                log.warn("Task of type {} is already running, rejecting new request", taskType);
                throw new APIException("A task of type " + taskType + " is already running. Please wait for it to complete.", HttpStatus.CONFLICT);
            }
        }
        String taskId = UUID.randomUUID().toString();
        if (!taskType.isParallel()) {
            runningTasks.put(taskType, taskId);
        }
        Map<String, Object> options = convertOptionsToMap(request.getOptions());
        taskHistoryService.createTask(taskId, taskType, user.getId(), options);
        return taskId;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> convertOptionsToMap(Object options) {
        if (options == null) {
            return Map.of();
        }
        if (options instanceof Map) {
            return (Map<String, Object>) options;
        }
        try {
            return objectMapper.convertValue(options, Map.class);
        } catch (IllegalArgumentException e) {
            log.warn("Failed to convert options to map, using empty map", e);
            return Map.of();
        }
    }

    private TaskCreateResponse executeTask(TaskCreateRequest request) {
        TaskType taskType = request.getTaskType();
        log.info("{}: Executing task", taskType);
        Task task = taskRegistry.get(taskType);
        if (task == null) {
            throw new UnsupportedOperationException("Task type not implemented: " + taskType);
        }
        return task.execute(request);
    }
}
