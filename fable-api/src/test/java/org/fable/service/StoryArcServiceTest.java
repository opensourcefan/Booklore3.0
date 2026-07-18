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
import org.fable.service.library.LibraryVisibilityService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
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
    @Mock
    private LibraryVisibilityService libraryVisibilityService;

    @InjectMocks
    private StoryArcService storyArcService;

    private FableUser user;

    @BeforeEach
    void setUp() {
        user = FableUser.builder().id(1L).build();
        lenient().when(authenticationService.getAuthenticatedUser()).thenReturn(user);
        lenient().when(libraryVisibilityService.getAccessibleLibraryIds(user)).thenReturn(Set.of(1L));
        lenient().when(bookService.getBooksByIds(anySet(), eq(false))).thenAnswer(inv -> {
            Set<Long> ids = inv.getArgument(0);
            return ids.stream().map(id -> Book.builder().id(id).build()).toList();
        });
    }

    @Test
    void getStoryArcs_shouldReturnMappedSummaries() {
        StoryArcEntity arc = StoryArcEntity.builder().id(1L).name("Invasion").build();
        List<Object[]> queryResult = new ArrayList<>();
        queryResult.add(new Object[]{arc, 5L, 2L, 10L});

        when(storyArcRepository.findStoryArcSummariesWithUserProgress(eq(1L), eq(Set.of(1L)))).thenReturn(queryResult);

        List<StoryArcSummary> summaries = storyArcService.getStoryArcs();

        assertEquals(1, summaries.size());
        StoryArcSummary summary = summaries.get(0);
        assertEquals("Invasion", summary.getStoryArcName());
        assertEquals(5, summary.getBookCount());
        assertEquals(2, summary.getReadBookCount());
        assertEquals(40, summary.getCompletionPercent());
        assertEquals(10L, summary.getCoverBookId());
    }

    @Test
    void getStoryArcs_shouldReturnEmptyWhenNoAccessibleLibraries() {
        when(libraryVisibilityService.getAccessibleLibraryIds(user)).thenReturn(Set.of());

        List<StoryArcSummary> summaries = storyArcService.getStoryArcs();

        assertTrue(summaries.isEmpty());
        verify(storyArcRepository, never()).findStoryArcSummariesWithUserProgress(anyLong(), anyCollection());
    }

    @Test
    void getStoryArc_shouldReturnRowTitleSentinelsForEmptyDraftArcs() {
        StoryArcEntity arc = StoryArcEntity.builder().id(1L).name("Lonely Arc")
                .externalUrl("https://guide.example.com")
                .description("A reading guide")
                .rowTitles("Prologue\nFinale")
                .build();

        when(storyArcRepository.findByName("Lonely Arc")).thenReturn(Optional.of(arc));
        when(repository.findAllByStoryArcNameOrderByRowIndexAscColIndexAsc("Lonely Arc")).thenReturn(Collections.emptyList());

        List<StoryArcBookMappingDto> result = storyArcService.getStoryArc("Lonely Arc");

        assertEquals(2, result.size());
        assertNull(result.get(0).getBookId());
        assertEquals("Prologue", result.get(0).getRowTitle());
        assertEquals(0, result.get(0).getRowIndex());
        assertEquals("https://guide.example.com", result.get(0).getExternalUrl());
        assertEquals("A reading guide", result.get(0).getDescription());
        assertEquals("Finale", result.get(1).getRowTitle());
        assertEquals(1, result.get(1).getRowIndex());
    }

    @Test
    void getStoryArc_shouldOmitInaccessibleMappings() {
        StoryArcEntity arc = StoryArcEntity.builder().id(1L).name("Shared").build();
        when(storyArcRepository.findByName("Shared")).thenReturn(Optional.of(arc));
        when(repository.findAllByStoryArcNameOrderByRowIndexAscColIndexAsc("Shared")).thenReturn(List.of(
                StoryArcBookMappingEntity.builder().id(1L).storyArcName("Shared").bookId(10L).rowIndex(0).colIndex(0).build(),
                StoryArcBookMappingEntity.builder().id(2L).storyArcName("Shared").bookId(99L).rowIndex(0).colIndex(1).build()
        ));
        when(bookService.getBooksByIds(anySet(), eq(false))).thenReturn(List.of(Book.builder().id(10L).build()));

        List<StoryArcBookMappingDto> result = storyArcService.getStoryArc("Shared");

        assertEquals(1, result.size());
        assertEquals(10L, result.get(0).getBookId());
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
                .bookIds(Arrays.asList(100L, 101L))
                .build();

        storyArcService.bulkAdd(request);

        ArgumentCaptor<StoryArcBookMappingEntity> captor = ArgumentCaptor.forClass(StoryArcBookMappingEntity.class);
        verify(repository, times(1)).save(captor.capture());

        StoryArcBookMappingEntity saved = captor.getValue();
        assertEquals("Crisis", saved.getStoryArcName());
        assertEquals(101L, saved.getBookId());
        assertEquals(0, saved.getRowIndex());
        assertEquals(1, saved.getColIndex());
        assertEquals(2.0, saved.getSequenceOrder());
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
    void saveLayout_shouldDeleteOnlyAccessibleMissingBooks() {
        StoryArcEntity arc = StoryArcEntity.builder().id(1L).name("Rebirth").build();
        when(storyArcRepository.findByName("Rebirth")).thenReturn(Optional.of(arc));

        StoryArcBookMappingEntity existing1 = StoryArcBookMappingEntity.builder().bookId(10L).storyArcName("Rebirth").storyArcId(1L).build();
        StoryArcBookMappingEntity existing2 = StoryArcBookMappingEntity.builder().bookId(11L).storyArcName("Rebirth").storyArcId(1L).build();
        StoryArcBookMappingEntity otherUserBook = StoryArcBookMappingEntity.builder().bookId(77L).storyArcName("Rebirth").storyArcId(1L).build();
        List<StoryArcBookMappingEntity> existing = Arrays.asList(existing1, existing2, otherUserBook);

        when(repository.findAllByStoryArcNameOrderByRowIndexAscColIndexAsc("Rebirth")).thenReturn(existing);
        when(bookService.getBooksByIds(anySet(), eq(false))).thenAnswer(inv -> {
            Set<Long> ids = inv.getArgument(0);
            return ids.stream()
                    .filter(id -> id != 77L)
                    .map(id -> Book.builder().id(id).build())
                    .toList();
        });

        StoryArcLayoutUpdateRequest request = StoryArcLayoutUpdateRequest.builder()
                .storyArcName("Rebirth")
                .items(Arrays.asList(
                        StoryArcLayoutUpdateRequest.LayoutItem.builder().bookId(11L).rowIndex(0).colIndex(0).sequenceOrder(1.0).isCore(true).rowTitle("Ch 1").build(),
                        StoryArcLayoutUpdateRequest.LayoutItem.builder().bookId(12L).rowIndex(0).colIndex(1).sequenceOrder(2.0).isCore(false).rowTitle("Ch 1").build()
                ))
                .build();

        storyArcService.saveLayout("Rebirth", request);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<StoryArcBookMappingEntity>> deleteCaptor = ArgumentCaptor.forClass(List.class);
        verify(repository).deleteAll(deleteCaptor.capture());
        assertEquals(1, deleteCaptor.getValue().size());
        assertEquals(10L, deleteCaptor.getValue().get(0).getBookId());

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
