package org.fable.controller;

import org.fable.config.security.service.AuthenticationService;
import org.fable.mapper.BookMetadataMapper;
import org.fable.model.MetadataUpdateContext;
import org.fable.model.MetadataUpdateWrapper;
import org.fable.model.dto.BookMetadata;
import org.fable.model.dto.request.BulkBookIdsRequest;
import org.fable.model.dto.request.BulkMetadataWipeRequest;
import org.fable.model.entity.BookEntity;
import org.fable.model.entity.BookMetadataEntity;
import org.fable.repository.BookRepository;
import org.fable.service.audit.AuditService;
import org.fable.model.enums.MetadataReplaceMode;
import org.fable.service.metadata.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MetadataControllerTest {

    @Mock
    private BookMetadataService bookMetadataService;
    @Mock
    private BookMetadataUpdater bookMetadataUpdater;
    @Mock
    private AuthenticationService authenticationService;
    @Mock
    private BookMetadataMapper bookMetadataMapper;
    @Mock
    private MetadataMatchService metadataMatchService;
    @Mock
    private DuckDuckGoCoverService duckDuckGoCoverService;
    @Mock
    private BookRepository bookRepository;
    @Mock
    private MetadataManagementService metadataManagementService;
    @Mock
    private AuditService auditService;

    @InjectMocks
    private MetadataController metadataController;

    private MetadataUpdateContext captureContextFromUpdate(MetadataReplaceMode replaceMode) {
        long bookId = 1L;
        MetadataUpdateWrapper wrapper = MetadataUpdateWrapper.builder().build();
        BookEntity bookEntity = new BookEntity();
        bookEntity.setId(bookId);
        bookEntity.setMetadata(new BookMetadataEntity());

        org.fable.model.dto.Book mockBook = org.fable.model.dto.Book.builder().metadata(new BookMetadata()).build();
        when(bookMetadataService.updateMetadata(eq(bookId), eq(wrapper), eq(true), eq(replaceMode))).thenReturn(mockBook);

        metadataController.updateMetadata(wrapper, bookId, true, replaceMode);

        verify(bookMetadataService).updateMetadata(eq(bookId), eq(wrapper), eq(true), eq(replaceMode));
        return null;
    }

    @Test
    void updateMetadata_shouldDelegateToService() {
        captureContextFromUpdate(MetadataReplaceMode.REPLACE_ALL);
    }

    @Test
    void wipeMetadata_shouldDelegateToService() {
        org.fable.model.dto.Book mockBook = org.fable.model.dto.Book.builder().metadata(new BookMetadata()).build();
        when(bookMetadataService.wipeBookMetadata(7L)).thenReturn(mockBook);

        metadataController.wipeMetadata(7L);

        verify(bookMetadataService).wipeBookMetadata(7L);
    }

    @Test
    void wipeMetadataBulk_shouldDelegateToService() {
        BulkMetadataWipeRequest request = new BulkMetadataWipeRequest();
        request.setBookIds(new java.util.HashSet<>(java.util.List.of(1L, 2L)));

        metadataController.wipeMetadataBulk(request);

        verify(bookMetadataService).wipeBookMetadata(request.getBookIds());
    }

    @Test
    void restoreTitlesFromFilenames_shouldDelegateToService() {
        BulkBookIdsRequest request = new BulkBookIdsRequest();
        request.setBookIds(new java.util.HashSet<>(java.util.List.of(1L, 2L)));
        when(bookMetadataService.restoreTitlesFromFilename(request.getBookIds())).thenReturn(java.util.List.of(org.fable.model.dto.Book.builder().build()));

        var response = metadataController.restoreTitlesFromFilenames(request);

        assertEquals(200, response.getStatusCode().value());
        assertEquals(1, response.getBody());
        verify(bookMetadataService).restoreTitlesFromFilename(request.getBookIds());
    }
}
