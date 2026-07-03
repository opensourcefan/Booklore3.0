package org.fable.service;

import org.fable.config.security.service.AuthenticationService;
import org.fable.model.dto.Book;
import org.fable.model.dto.FableUser;
import org.fable.model.dto.StoryArcBookMappingDto;
import org.fable.model.dto.StoryArcSummary;
import org.fable.model.dto.request.StoryArcBulkAddRequest;
import org.fable.model.dto.request.StoryArcLayoutUpdateRequest;
import org.fable.model.entity.StoryArcBookMappingEntity;
import org.fable.model.entity.StoryArcEntity;
import org.fable.repository.StoryArcBookMappingRepository;
import org.fable.repository.StoryArcRepository;
import org.fable.service.book.BookService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class StoryArcServiceTest {

    @Mock
    private StoryArcRepository storyArcRepository;
    @Mock
    private StoryArcBookMappingRepository repository;
    @Mock
    private BookService bookService;
    @Mock
    private AuthenticationService authenticationService;

    @InjectMocks
    private StoryArcService storyArcService;

    private FableUser user;

    @BeforeEach
    void setUp() {
        user = FableUser.builder().id(1L).build();
    }

    @Test
    void getStoryArcs_shouldReturnMappedSummaries() {
        when(authenticationService.getAuthenticatedUser()).thenReturn(user);

        StoryArcEntity arc = StoryArcEntity.builder().id(1L).name("Invasion").build();
        List<Object[]> queryResult = new ArrayList<>();
        queryResult.add(new Object[]{arc, 5L, 2L, 10L}); // entity, totalCount, readCount, coverBookId

        when(storyArcRepository.findStoryArcSummariesWithUserProgress(1L)).thenReturn(queryResult);

        List<StoryArcSummary> summaries = storyArcService.getStoryArcs();

        assertEquals(1, summaries.size());
        StoryArcSummary summary = summaries.get(0);
        assertEquals("Invasion", summary.getStoryArcName());
        assertEquals(5, summary.getBookCount());
        assertEquals(2, summary.getReadBookCount());
        assertEquals(40, summary.getCompletionPercent()); // (2 * 100) / 5
        assertEquals(10L, summary.getCoverBookId());
    }

    @Test
    void getStoryArcs_shouldReturnEmptyArcWithZeroBooks() {
        when(authenticationService.getAuthenticatedUser()).thenReturn(user);

        StoryArcEntity arc = StoryArcEntity.builder().id(1L).name("Empty Arc")
                .externalUrl("https://example.com")
                .description("A guide with no books yet")
                .build();
        List<Object[]> queryResult = new ArrayList<>();
        queryResult.add(new Object[]{arc, 0L, 0L, null}); // entity, totalCount=0, readCount=0, coverBookId=null

        when(storyArcRepository.findStoryArcSummariesWithUserProgress(1L)).thenReturn(queryResult);

        List<StoryArcSummary> summaries = storyArcService.getStoryArcs();

        assertEquals(1, summaries.size());
        StoryArcSummary summary = summaries.get(0);
        assertEquals("Empty Arc", summary.getStoryArcName());
        assertEquals(0, summary.getBookCount());
        assertEquals(0, summary.getReadBookCount());
        assertEquals(0, summary.getCompletionPercent());
        assertNull(summary.getCoverBookId());
    }

    @Test
    void getStoryArc_shouldReturnSentinelWhenNoMappings() {
        StoryArcEntity arc = StoryArcEntity.builder().id(1L).name("Lonely Arc")
                .externalUrl("https://guide.example.com")
                .description("A reading guide")
                .build();

        when(storyArcRepository.findByName("Lonely Arc")).thenReturn(Optional.of(arc));
        when(repository.findAllByStoryArcNameOrderByRowIndexAscColIndexAsc("Lonely Arc")).thenReturn(Collections.emptyList());

        List<StoryArcBookMappingDto> result = storyArcService.getStoryArc("Lonely Arc");

        assertEquals(1, result.size());
        StoryArcBookMappingDto sentinel = result.get(0);
        assertEquals("Lonely Arc", sentinel.getStoryArcName());
        assertEquals("https://guide.example.com", sentinel.getExternalUrl());
        assertEquals("A reading guide", sentinel.getDescription());
        assertNull(sentinel.getBookId());
    }

    @Test
    void getStoryArc_shouldReturnEmptyWhenArcNotFound() {
        when(storyArcRepository.findByName("Nonexistent")).thenReturn(Optional.empty());

        List<StoryArcBookMappingDto> result = storyArcService.getStoryArc("Nonexistent");

        assertTrue(result.isEmpty());
    }

    @Test
    void bulkAdd_shouldSaveNewMappings() {
        StoryArcEntity arc = StoryArcEntity.builder().id(1L).name("Crisis").build();
        when(storyArcRepository.findByName("Crisis")).thenReturn(Optional.of(arc));

        List<StoryArcBookMappingEntity> existing = new ArrayList<>();
        existing.add(StoryArcBookMappingEntity.builder()
                .storyArcName("Crisis")
                .storyArcId(1L)
                .bookId(100L)
                .rowIndex(0)
                .colIndex(0)
                .sequenceOrder(1.0)
                .build());

        when(repository.findAllByStoryArcNameOrderByRowIndexAscColIndexAsc("Crisis")).thenReturn(existing);

        StoryArcBulkAddRequest request = StoryArcBulkAddRequest.builder()
                .storyArcName("Crisis")
                .bookIds(Arrays.asList(100L, 101L)) // 100L is already in, 101L is new
                .build();

        storyArcService.bulkAdd(request);

        ArgumentCaptor<StoryArcBookMappingEntity> captor = ArgumentCaptor.forClass(StoryArcBookMappingEntity.class);
        verify(repository, times(1)).save(captor.capture());

        StoryArcBookMappingEntity saved = captor.getValue();
        assertEquals("Crisis", saved.getStoryArcName());
        assertEquals(101L, saved.getBookId());
        assertEquals(0, saved.getRowIndex());
        assertEquals(1, saved.getColIndex()); // Incremented from 0
        assertEquals(2.0, saved.getSequenceOrder()); // Incremented from 1.0
    }

    @Test
    void bulkAdd_shouldCreateArcIfNotExists() {
        when(storyArcRepository.findByName("New Arc")).thenReturn(Optional.empty());
        when(storyArcRepository.save(any(StoryArcEntity.class))).thenReturn(
                StoryArcEntity.builder().id(99L).name("New Arc").build());
        when(repository.findAllByStoryArcNameOrderByRowIndexAscColIndexAsc("New Arc")).thenReturn(Collections.emptyList());

        StoryArcBulkAddRequest request = StoryArcBulkAddRequest.builder()
                .storyArcName("New Arc")
                .bookIds(Arrays.asList(200L))
                .build();

        storyArcService.bulkAdd(request);

        verify(storyArcRepository).save(any(StoryArcEntity.class));
        verify(repository).save(any(StoryArcBookMappingEntity.class));
    }

    @Test
    void saveLayout_shouldDeleteMissingAndSaveProvided() {
        StoryArcEntity arc = StoryArcEntity.builder().id(1L).name("Rebirth").build();
        when(storyArcRepository.findByName("Rebirth")).thenReturn(Optional.of(arc));

        StoryArcBookMappingEntity existing1 = StoryArcBookMappingEntity.builder().bookId(10L).storyArcName("Rebirth").storyArcId(1L).build();
        StoryArcBookMappingEntity existing2 = StoryArcBookMappingEntity.builder().bookId(11L).storyArcName("Rebirth").storyArcId(1L).build();
        List<StoryArcBookMappingEntity> existing = Arrays.asList(existing1, existing2);

        when(repository.findAllByStoryArcNameOrderByRowIndexAscColIndexAsc("Rebirth")).thenReturn(existing);

        // Request contains 11L and 12L (10L is missing -> should be deleted, 12L is new -> should be added)
        StoryArcLayoutUpdateRequest request = StoryArcLayoutUpdateRequest.builder()
                .storyArcName("Rebirth")
                .items(Arrays.asList(
                        StoryArcLayoutUpdateRequest.LayoutItem.builder().bookId(11L).rowIndex(0).colIndex(0).sequenceOrder(1.0).isCore(true).rowTitle("Ch 1").build(),
                        StoryArcLayoutUpdateRequest.LayoutItem.builder().bookId(12L).rowIndex(0).colIndex(1).sequenceOrder(2.0).isCore(false).rowTitle("Ch 1").build()
                ))
                .build();

        storyArcService.saveLayout("Rebirth", request);

        // Verify delete of 10L
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<StoryArcBookMappingEntity>> deleteCaptor = ArgumentCaptor.forClass(List.class);
        verify(repository).deleteAll(deleteCaptor.capture());
        assertEquals(1, deleteCaptor.getValue().size());
        assertEquals(10L, deleteCaptor.getValue().get(0).getBookId());

        // Verify save of 11L and 12L
        verify(repository, times(2)).save(any(StoryArcBookMappingEntity.class));
    }

    @Test
    void saveLayout_shouldCreateArcIfNotExists() {
        when(storyArcRepository.findByName("New Layout Arc")).thenReturn(Optional.empty());
        when(storyArcRepository.save(any(StoryArcEntity.class))).thenReturn(
                StoryArcEntity.builder().id(50L).name("New Layout Arc").externalUrl("http://example.com").description("desc").build());
        when(repository.findAllByStoryArcNameOrderByRowIndexAscColIndexAsc("New Layout Arc")).thenReturn(Collections.emptyList());

        StoryArcLayoutUpdateRequest request = StoryArcLayoutUpdateRequest.builder()
                .storyArcName("New Layout Arc")
                .externalUrl("http://example.com")
                .description("desc")
                .items(Collections.emptyList())
                .build();

        storyArcService.saveLayout("New Layout Arc", request);

        verify(storyArcRepository).save(any(StoryArcEntity.class));
    }

    @Test
    void deleteStoryArc_shouldDeleteByName() {
        storyArcService.deleteStoryArc("ToDelete");

        verify(storyArcRepository).deleteByName("ToDelete");
    }

    @Test
    void removeBooksFromStoryArc_shouldDeleteMappings() {
        storyArcService.removeBooksFromStoryArc("Arc", Arrays.asList(1L, 2L));

        verify(repository).deleteAllByStoryArcNameAndBookIdIn("Arc", Arrays.asList(1L, 2L));
    }
}
