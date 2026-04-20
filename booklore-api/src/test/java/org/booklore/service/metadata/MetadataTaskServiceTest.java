package org.booklore.service.metadata;

import org.booklore.config.security.service.AuthenticationService;
import org.booklore.mapper.FetchedProposalMapper;
import org.booklore.model.dto.BookLoreUser;
import org.booklore.model.dto.FetchedProposal;
import org.booklore.model.dto.MetadataBatchProgressNotification;
import org.booklore.model.dto.request.MetadataRefreshRequest;
import org.booklore.model.dto.request.TaskCreateRequest;
import org.booklore.model.dto.response.MetadataResumableTaskResponse;
import org.booklore.model.dto.response.MetadataTaskLogResponse;
import org.booklore.model.dto.response.TaskCancelResponse;
import org.booklore.model.dto.response.TaskCreateResponse;
import org.booklore.model.dto.response.MetadataTaskDetailsResponse;
import org.booklore.model.entity.BookEntity;
import org.booklore.model.entity.BookFileEntity;
import org.booklore.model.entity.BookMetadataEntity;
import org.booklore.model.entity.MetadataFetchJobEntity;
import org.booklore.model.entity.MetadataFetchProposalEntity;
import org.booklore.model.entity.TaskHistoryEntity;
import org.booklore.model.enums.FetchedMetadataProposalStatus;
import org.booklore.model.enums.MetadataFetchTaskStatus;
import org.booklore.model.enums.TaskType;
import org.booklore.repository.BookRepository;
import org.booklore.repository.MetadataFetchJobRepository;
import org.booklore.repository.MetadataFetchProposalRepository;
import org.booklore.repository.TaskHistoryRepository;
import org.booklore.service.task.TaskService;
import org.booklore.task.TaskStatus;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MetadataTaskServiceTest {

    @Mock
    private MetadataFetchJobRepository metadataFetchTaskRepository;

    @Mock
    private MetadataFetchProposalRepository proposalRepository;

    @Mock
    private TaskHistoryRepository taskHistoryRepository;

    @Mock
    private BookRepository bookRepository;

    @Mock
    private FetchedProposalMapper fetchedProposalMapper;

    @Mock
    private AuthenticationService authenticationService;

    @Mock
    private TaskService taskService;

    @Mock
    private MetadataRefreshService metadataRefreshService;

    @Mock
    private ObjectMapper objectMapper;

    @InjectMocks
    private MetadataTaskService service;

    private MetadataFetchJobEntity buildTask(String taskId, MetadataFetchTaskStatus status, List<MetadataFetchProposalEntity> proposals) {
        return MetadataFetchJobEntity.builder()
                .taskId(taskId)
                .status(status)
                .userId(1L)
                .startedAt(Instant.now())
                .totalBooksCount(10)
                .completedBooks(5)
                .requestedBookIds(List.of(100L, 101L, 102L, 103L, 104L, 105L, 106L, 107L, 108L, 109L))
                .proposals(proposals)
                .build();
    }

    private MetadataFetchProposalEntity buildProposal(Long id, MetadataFetchJobEntity job, FetchedMetadataProposalStatus status) {
        return MetadataFetchProposalEntity.builder()
                .proposalId(id)
                .job(job)
                .bookId(100L)
                .status(status)
                .build();
    }

        private BookEntity buildBook(Long id, String title, String fileName) {
        BookEntity book = BookEntity.builder()
            .id(id)
            .metadata(BookMetadataEntity.builder().bookId(id).title(title).build())
            .build();
        book.setBookFiles(List.of(BookFileEntity.builder()
            .id(id)
            .book(book)
            .fileName(fileName)
            .fileSubPath("")
            .isBookFormat(true)
            .build()));
        return book;
        }

    @Nested
    class GetTaskWithProposals {

        @Test
        void returnsEmptyWhenTaskNotFound() {
            when(metadataFetchTaskRepository.findById("missing")).thenReturn(Optional.empty());
            assertThat(service.getTaskWithProposals("missing")).isEmpty();
        }

        @Test
        void returnsResponseWithOnlyFetchedProposals() {
            MetadataFetchJobEntity task = buildTask("t1", MetadataFetchTaskStatus.COMPLETED, new ArrayList<>());
            MetadataFetchProposalEntity fetched = buildProposal(1L, task, FetchedMetadataProposalStatus.FETCHED);
            MetadataFetchProposalEntity accepted = buildProposal(2L, task, FetchedMetadataProposalStatus.ACCEPTED);
            MetadataFetchProposalEntity rejected = buildProposal(3L, task, FetchedMetadataProposalStatus.REJECTED);
            task.setProposals(List.of(fetched, accepted, rejected));

            when(metadataFetchTaskRepository.findById("t1")).thenReturn(Optional.of(task));
            when(fetchedProposalMapper.toDto(fetched)).thenReturn(FetchedProposal.builder().proposalId(1L).build());

            Optional<MetadataTaskDetailsResponse> result = service.getTaskWithProposals("t1");

            assertThat(result).isPresent();
            assertThat(result.get().getTask().getProposals()).hasSize(1);
            assertThat(result.get().getTask().getProposals().getFirst().getProposalId()).isEqualTo(1L);
            verify(fetchedProposalMapper, times(1)).toDto(any());
        }

        @Test
        void mapsTaskFieldsCorrectly() {
            MetadataFetchJobEntity task = buildTask("t2", MetadataFetchTaskStatus.IN_PROGRESS, new ArrayList<>());
            task.setCompletedAt(Instant.now());

            when(metadataFetchTaskRepository.findById("t2")).thenReturn(Optional.of(task));

            var result = service.getTaskWithProposals("t2").orElseThrow();
            var dto = result.getTask();

            assertThat(dto.getId()).isEqualTo("t2");
            assertThat(dto.getStatus()).isEqualTo(MetadataFetchTaskStatus.IN_PROGRESS);
            assertThat(dto.getCompleted()).isEqualTo(5);
            assertThat(dto.getTotalBooks()).isEqualTo(10);
            assertThat(dto.getInitiatedBy()).isEqualTo(1L);
        }
    }

    @Nested
    class DeleteTaskAndProposals {

        @Test
        void returnsTrueAndDeletesWhenFound() {
            MetadataFetchJobEntity task = buildTask("t1", MetadataFetchTaskStatus.COMPLETED, new ArrayList<>());
            when(metadataFetchTaskRepository.findById("t1")).thenReturn(Optional.of(task));

            assertThat(service.deleteTaskAndProposals("t1")).isTrue();
            verify(metadataFetchTaskRepository).delete(task);
        }

        @Test
        void returnsFalseWhenNotFound() {
            when(metadataFetchTaskRepository.findById("missing")).thenReturn(Optional.empty());
            assertThat(service.deleteTaskAndProposals("missing")).isFalse();
            verify(metadataFetchTaskRepository, never()).delete(any());
        }
    }

    @Nested
    class CancelMetadataTask {

        @Test
        void cancelsManualMetadataTask() {
            TaskHistoryEntity taskHistory = TaskHistoryEntity.builder()
                    .id("task-1")
                    .type(TaskType.REFRESH_METADATA_MANUAL)
                    .build();
            TaskCancelResponse response = TaskCancelResponse.builder()
                    .taskId("task-1")
                    .cancelled(true)
                    .message("Task cancellation requested. The task will stop at the next checkpoint.")
                    .build();

            when(taskHistoryRepository.findById("task-1")).thenReturn(Optional.of(taskHistory));
            when(taskService.cancelTask("task-1")).thenReturn(response);

            Optional<TaskCancelResponse> result = service.cancelMetadataTask("task-1");

            assertThat(result).contains(response);
            verify(taskService).cancelTask("task-1");
        }

        @Test
        void returnsEmptyWhenTaskIsNotMetadataRefresh() {
            TaskHistoryEntity taskHistory = TaskHistoryEntity.builder()
                    .id("task-1")
                    .type(TaskType.CLEANUP_TEMP_METADATA)
                    .build();

            when(taskHistoryRepository.findById("task-1")).thenReturn(Optional.of(taskHistory));

            assertThat(service.cancelMetadataTask("task-1")).isEmpty();
            verify(taskService, never()).cancelTask(any());
        }

        @Test
        void returnsEmptyWhenTaskHistoryMissing() {
            when(taskHistoryRepository.findById("missing")).thenReturn(Optional.empty());

            assertThat(service.cancelMetadataTask("missing")).isEmpty();
            verify(taskService, never()).cancelTask(any());
        }
    }

    @Nested
    class UpdateProposalStatus {

        @Test
        void updatesProposalStatusSuccessfully() {
            Long userId = 42L;
            when(authenticationService.getAuthenticatedUser())
                    .thenReturn(BookLoreUser.builder().id(userId).build());

            MetadataFetchJobEntity job = buildTask("t1", MetadataFetchTaskStatus.COMPLETED, new ArrayList<>());
            MetadataFetchProposalEntity proposal = buildProposal(10L, job, FetchedMetadataProposalStatus.FETCHED);

            when(proposalRepository.findById(10L)).thenReturn(Optional.of(proposal));

            boolean result = service.updateProposalStatus("t1", 10L, "ACCEPTED");

            assertThat(result).isTrue();
            assertThat(proposal.getStatus()).isEqualTo(FetchedMetadataProposalStatus.ACCEPTED);
            assertThat(proposal.getReviewerUserId()).isEqualTo(userId);
            assertThat(proposal.getReviewedAt()).isNotNull();
            verify(proposalRepository).save(proposal);
        }

        @Test
        void returnsFalseForInvalidStatus() {
            when(authenticationService.getAuthenticatedUser())
                    .thenReturn(BookLoreUser.builder().id(1L).build());

            boolean result = service.updateProposalStatus("t1", 10L, "INVALID_STATUS");

            assertThat(result).isFalse();
            verify(proposalRepository, never()).save(any());
        }

        @Test
        void returnsFalseWhenProposalNotFound() {
            when(authenticationService.getAuthenticatedUser())
                    .thenReturn(BookLoreUser.builder().id(1L).build());
            when(proposalRepository.findById(99L)).thenReturn(Optional.empty());

            boolean result = service.updateProposalStatus("t1", 99L, "ACCEPTED");

            assertThat(result).isFalse();
        }

        @Test
        void returnsFalseWhenProposalTaskIdMismatch() {
            when(authenticationService.getAuthenticatedUser())
                    .thenReturn(BookLoreUser.builder().id(1L).build());

            MetadataFetchJobEntity differentJob = buildTask("other-task", MetadataFetchTaskStatus.COMPLETED, new ArrayList<>());
            MetadataFetchProposalEntity proposal = buildProposal(10L, differentJob, FetchedMetadataProposalStatus.FETCHED);
            when(proposalRepository.findById(10L)).thenReturn(Optional.of(proposal));

            boolean result = service.updateProposalStatus("t1", 10L, "ACCEPTED");

            assertThat(result).isFalse();
            verify(proposalRepository, never()).save(any());
        }

        @Test
        void returnsFalseWhenProposalJobIsNull() {
            when(authenticationService.getAuthenticatedUser())
                    .thenReturn(BookLoreUser.builder().id(1L).build());

            MetadataFetchProposalEntity proposal = MetadataFetchProposalEntity.builder()
                    .proposalId(10L)
                    .job(null)
                    .status(FetchedMetadataProposalStatus.FETCHED)
                    .build();
            when(proposalRepository.findById(10L)).thenReturn(Optional.of(proposal));

            boolean result = service.updateProposalStatus("t1", 10L, "ACCEPTED");

            assertThat(result).isFalse();
        }

        @Test
        void handlesLowercaseStatusString() {
            when(authenticationService.getAuthenticatedUser())
                    .thenReturn(BookLoreUser.builder().id(1L).build());

            MetadataFetchJobEntity job = buildTask("t1", MetadataFetchTaskStatus.COMPLETED, new ArrayList<>());
            MetadataFetchProposalEntity proposal = buildProposal(10L, job, FetchedMetadataProposalStatus.FETCHED);
            when(proposalRepository.findById(10L)).thenReturn(Optional.of(proposal));

            boolean result = service.updateProposalStatus("t1", 10L, "rejected");

            assertThat(result).isTrue();
            assertThat(proposal.getStatus()).isEqualTo(FetchedMetadataProposalStatus.REJECTED);
        }
    }

    @Nested
    class GetActiveTasks {

        @Test
        void includesCancelledTasksForResume() {
            MetadataFetchJobEntity inProgress = buildTask("ip", MetadataFetchTaskStatus.IN_PROGRESS, new ArrayList<>());
            MetadataFetchJobEntity cancelled = buildTask("ca", MetadataFetchTaskStatus.CANCELLED, new ArrayList<>());
            MetadataFetchJobEntity completed = buildTask("co", MetadataFetchTaskStatus.COMPLETED, List.of(
                    MetadataFetchProposalEntity.builder().proposalId(1L).status(FetchedMetadataProposalStatus.FETCHED).build()
            ));

            when(metadataFetchTaskRepository.findAllWithProposals())
                    .thenReturn(List.of(inProgress, cancelled, completed));
            when(taskService.isTaskRunning("ip")).thenReturn(true);

            List<MetadataBatchProgressNotification> result = service.getActiveTasks();

            assertThat(result).hasSize(3);
            assertThat(result).extracting(MetadataBatchProgressNotification::getTaskId)
                .containsExactlyInAnyOrder("ip", "ca", "co");
        }

        @Test
        void inProgressTaskUsesPersistedStatusMessageAndIsNotReview() {
            MetadataFetchJobEntity task = MetadataFetchJobEntity.builder()
                    .taskId("ip")
                    .status(MetadataFetchTaskStatus.IN_PROGRESS)
                    .statusMessage("Waiting for ComicVine rate limit reset. Time left: 12m 10s. Resets at 6:45:00 PM. Processed 66 of 100 books.")
                    .totalBooksCount(100)
                    .completedBooks(66)
                    .startedAt(Instant.now())
                    .proposals(new ArrayList<>())
                    .build();

            when(metadataFetchTaskRepository.findAllWithProposals()).thenReturn(List.of(task));
            when(taskService.isTaskRunning("ip")).thenReturn(true);

            List<MetadataBatchProgressNotification> result = service.getActiveTasks();

            assertThat(result).hasSize(1);
            var notification = result.getFirst();
            assertThat(notification.getCompleted()).isEqualTo(66);
            assertThat(notification.getTotal()).isEqualTo(100);
            assertThat(notification.getStatus()).isEqualTo("IN_PROGRESS");
            assertThat(notification.getMessage()).contains("Waiting for ComicVine rate limit reset");
            assertThat(notification.isReview()).isFalse();
        }

        @Test
        void completedTaskCountsAcceptedAsCompleted() {
            MetadataFetchProposalEntity accepted1 = MetadataFetchProposalEntity.builder()
                    .proposalId(1L).status(FetchedMetadataProposalStatus.ACCEPTED).build();
            MetadataFetchProposalEntity accepted2 = MetadataFetchProposalEntity.builder()
                    .proposalId(2L).status(FetchedMetadataProposalStatus.ACCEPTED).build();
            MetadataFetchProposalEntity fetched = MetadataFetchProposalEntity.builder()
                    .proposalId(3L).status(FetchedMetadataProposalStatus.FETCHED).build();
            MetadataFetchProposalEntity rejected = MetadataFetchProposalEntity.builder()
                    .proposalId(4L).status(FetchedMetadataProposalStatus.REJECTED).build();

            MetadataFetchJobEntity task = buildTask("co", MetadataFetchTaskStatus.COMPLETED,
                    List.of(accepted1, accepted2, fetched, rejected));

            when(metadataFetchTaskRepository.findAllWithProposals()).thenReturn(List.of(task));

            List<MetadataBatchProgressNotification> result = service.getActiveTasks();

            assertThat(result).hasSize(1);
            var notification = result.getFirst();
            assertThat(notification.getCompleted()).isEqualTo(2);
            assertThat(notification.getTotal()).isEqualTo(3);
            assertThat(notification.getStatus()).isEqualTo("COMPLETED");
            assertThat(notification.getMessage()).contains("1 books need review");
        }

        @Test
        void errorTaskUsesTotalBooksCountAndCompletedBooks() {
            MetadataFetchProposalEntity fetched = MetadataFetchProposalEntity.builder()
                    .proposalId(1L).status(FetchedMetadataProposalStatus.FETCHED).build();

            MetadataFetchJobEntity task = MetadataFetchJobEntity.builder()
                    .taskId("err")
                    .status(MetadataFetchTaskStatus.ERROR)
                    .totalBooksCount(20)
                    .completedBooks(15)
                    .startedAt(Instant.now())
                    .proposals(List.of(fetched))
                    .build();

            when(metadataFetchTaskRepository.findAllWithProposals()).thenReturn(List.of(task));

            List<MetadataBatchProgressNotification> result = service.getActiveTasks();

            assertThat(result).hasSize(1);
            var notification = result.getFirst();
            assertThat(notification.getCompleted()).isEqualTo(15);
            assertThat(notification.getTotal()).isEqualTo(20);
            assertThat(notification.getStatus()).isEqualTo("ERROR");
            assertThat(notification.getMessage()).contains("failed");
        }

        @Test
        void errorTaskFallsBackToRemainingSizeWhenTotalBooksCountNull() {
            MetadataFetchProposalEntity fetched1 = MetadataFetchProposalEntity.builder()
                    .proposalId(1L).status(FetchedMetadataProposalStatus.FETCHED).build();
            MetadataFetchProposalEntity fetched2 = MetadataFetchProposalEntity.builder()
                    .proposalId(2L).status(FetchedMetadataProposalStatus.FETCHED).build();

            MetadataFetchJobEntity task = MetadataFetchJobEntity.builder()
                    .taskId("err")
                    .status(MetadataFetchTaskStatus.ERROR)
                    .totalBooksCount(null)
                    .completedBooks(null)
                    .startedAt(Instant.now())
                    .proposals(List.of(fetched1, fetched2))
                    .build();

            when(metadataFetchTaskRepository.findAllWithProposals()).thenReturn(List.of(task));

            List<MetadataBatchProgressNotification> result = service.getActiveTasks();

            assertThat(result).hasSize(1);
            assertThat(result.getFirst().getTotal()).isEqualTo(2);
            assertThat(result.getFirst().getCompleted()).isEqualTo(0);
        }

        @Test
        void keepsTasksWithZeroTotalVisible() {
            MetadataFetchJobEntity task = buildTask("empty", MetadataFetchTaskStatus.COMPLETED, List.of(
                    MetadataFetchProposalEntity.builder().proposalId(1L).status(FetchedMetadataProposalStatus.REJECTED).build()
            ));

            when(metadataFetchTaskRepository.findAllWithProposals()).thenReturn(List.of(task));

            List<MetadataBatchProgressNotification> result = service.getActiveTasks();

            assertThat(result).hasSize(1);
            assertThat(result.getFirst().getTaskId()).isEqualTo("empty");
            assertThat(result.getFirst().getTotal()).isZero();
            assertThat(result.getFirst().getStatus()).isEqualTo("COMPLETED");
        }

        @Test
        void completedNotificationsHaveIsReviewTrue() {
            MetadataFetchProposalEntity fetched = MetadataFetchProposalEntity.builder()
                    .proposalId(1L).status(FetchedMetadataProposalStatus.FETCHED).build();

            MetadataFetchJobEntity task = buildTask("t1", MetadataFetchTaskStatus.COMPLETED, List.of(fetched));

            when(metadataFetchTaskRepository.findAllWithProposals()).thenReturn(List.of(task));

            List<MetadataBatchProgressNotification> result = service.getActiveTasks();

            assertThat(result).allMatch(MetadataBatchProgressNotification::isReview);
        }

        @Test
        void errorTaskIsMarkedResumableWhenPendingBooksRemain() {
            MetadataFetchJobEntity task = buildTask("err", MetadataFetchTaskStatus.ERROR, new ArrayList<>());
            task.setCompletedBookIds(List.of(100L, 101L, 102L));

            when(metadataFetchTaskRepository.findAllWithProposals()).thenReturn(List.of(task));

            List<MetadataBatchProgressNotification> result = service.getActiveTasks();

            assertThat(result).hasSize(1);
            assertThat(result.getFirst().isResumable()).isTrue();
            assertThat(result.getFirst().getPendingCount()).isEqualTo(7);
        }

        @Test
        void staleInProgressTaskBecomesResumableError() {
            MetadataFetchJobEntity task = buildTask("stale", MetadataFetchTaskStatus.IN_PROGRESS, new ArrayList<>());
            task.setCompletedBookIds(List.of(100L, 101L));

            TaskHistoryEntity history = TaskHistoryEntity.builder()
                    .id("stale")
                    .type(TaskType.REFRESH_METADATA_MANUAL)
                    .status(TaskStatus.IN_PROGRESS)
                    .createdAt(LocalDateTime.now().minusMinutes(5))
                    .build();

            when(metadataFetchTaskRepository.findAllWithProposals()).thenReturn(List.of(task));
            when(taskService.isTaskRunning("stale")).thenReturn(false);
            when(taskHistoryRepository.findById("stale")).thenReturn(Optional.of(history));

            List<MetadataBatchProgressNotification> result = service.getActiveTasks();

            assertThat(result).hasSize(1);
            assertThat(result.getFirst().getStatus()).isEqualTo("ERROR");
            assertThat(result.getFirst().isResumable()).isTrue();
            verify(metadataFetchTaskRepository).save(task);
            verify(taskHistoryRepository).save(history);
        }
    }

    @Nested
    class ResumeMetadataTask {

        @Test
        void returnsLatestResumableTaskForCurrentUser() {
            BookLoreUser user = BookLoreUser.builder().id(1L).build();
            MetadataFetchJobEntity task = buildTask("resume-me", MetadataFetchTaskStatus.ERROR, new ArrayList<>());
            task.setCompletedBookIds(List.of(100L, 101L, 102L, 103L));

            when(authenticationService.getAuthenticatedUser()).thenReturn(user);
            when(metadataFetchTaskRepository.findAllWithProposalsByUserIdOrderByStartedAtDesc(1L)).thenReturn(List.of(task));

            Optional<MetadataResumableTaskResponse> result = service.getLatestResumableTask();

            assertThat(result).isPresent();
            assertThat(result.get().getTaskId()).isEqualTo("resume-me");
            assertThat(result.get().getPendingBooksCount()).isEqualTo(6);
        }

        @Test
        void resumesPendingBooksFromFailedTask() {
            MetadataFetchJobEntity task = buildTask("resume-me", MetadataFetchTaskStatus.ERROR, new ArrayList<>());
            task.setCompletedBookIds(List.of(100L, 101L, 102L));

            TaskHistoryEntity history = TaskHistoryEntity.builder()
                    .id("resume-me")
                    .type(TaskType.REFRESH_METADATA_MANUAL)
                    .taskOptions(Map.of())
                    .build();

            MetadataRefreshRequest originalRequest = MetadataRefreshRequest.builder()
                    .refreshType(MetadataRefreshRequest.RefreshType.BOOKS)
                    .bookIds(new java.util.LinkedHashSet<>(List.of(100L, 101L, 102L, 103L, 104L, 105L, 106L, 107L, 108L, 109L)))
                    .build();

            TaskCreateResponse resumedResponse = TaskCreateResponse.builder()
                    .taskId("new-task")
                    .taskType(TaskType.REFRESH_METADATA_MANUAL)
                    .status(TaskStatus.ACCEPTED)
                    .build();

            when(metadataFetchTaskRepository.findByTaskIdWithProposals("resume-me")).thenReturn(Optional.of(task));
            when(taskHistoryRepository.findById("resume-me")).thenReturn(Optional.of(history));
            when(objectMapper.convertValue(history.getTaskOptions(), MetadataRefreshRequest.class)).thenReturn(originalRequest);
            when(taskService.runAsUser(any(TaskCreateRequest.class))).thenReturn(resumedResponse);

            Optional<TaskCreateResponse> result = service.resumeMetadataTask("resume-me");

            assertThat(result).contains(resumedResponse);
            verify(taskService).runAsUser(argThat(request -> {
                MetadataRefreshRequest options = request.getOptionsAs(MetadataRefreshRequest.class);
                return options.getRefreshType() == MetadataRefreshRequest.RefreshType.BOOKS
                        && options.getBookIds().containsAll(List.of(103L, 104L, 105L, 106L, 107L, 108L, 109L))
                        && options.getBookIds().size() == 7;
            }));
            assertThat(task.getStatusMessage()).contains("new-task");
        }
    }

    @Nested
    class GetTaskLog {

        @Test
        void returnsFetchedAndRemainingBooksWithTitlesAndFileNames() {
            MetadataFetchJobEntity task = buildTask("log-task", MetadataFetchTaskStatus.IN_PROGRESS, new ArrayList<>());
            task.setStatusMessage("Paused for ComicVine rate limit reset. Resets at 6:45:00 PM. Processed 2 of 10 books.");
            task.setRequestedBookIds(List.of(100L, 101L, 102L));
            task.setCompletedBookIds(List.of(100L, 102L));

            when(metadataFetchTaskRepository.findByTaskIdWithProposals("log-task")).thenReturn(Optional.of(task));
            when(taskService.isTaskRunning("log-task")).thenReturn(true);
            when(bookRepository.findAllWithMetadataByIds(any())).thenReturn(List.of(
                    buildBook(100L, "Fetched One", "fetched-one.cbz"),
                    buildBook(101L, "Remaining One", "remaining-one.cbz"),
                    buildBook(102L, "Fetched Two", "fetched-two.cbz")
            ));

            MetadataTaskLogResponse result = service.getTaskLog("log-task").orElseThrow();

            assertThat(result.getStatus()).isEqualTo(MetadataFetchTaskStatus.IN_PROGRESS);
            assertThat(result.getCompleted()).isEqualTo(2);
            assertThat(result.getPending()).isEqualTo(1);
            assertThat(result.getFetchedBooks()).extracting(book -> book.getTitle() + ":" + book.getFileName())
                    .containsExactly("Fetched One:fetched-one.cbz", "Fetched Two:fetched-two.cbz");
            assertThat(result.getRemainingBooks()).extracting(book -> book.getTitle() + ":" + book.getFileName())
                    .containsExactly("Remaining One:remaining-one.cbz");
        }
    }
}
