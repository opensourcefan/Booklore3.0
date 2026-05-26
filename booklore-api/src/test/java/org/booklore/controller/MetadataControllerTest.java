package org.booklore.controller;

import org.booklore.config.security.service.AuthenticationService;
import org.booklore.mapper.BookMetadataMapper;
import org.booklore.model.MetadataUpdateContext;
import org.booklore.model.MetadataUpdateWrapper;
import org.booklore.model.dto.BookMetadata;
import org.booklore.model.dto.request.BulkBookIdsRequest;
import org.booklore.model.dto.request.BulkMetadataWipeRequest;
import org.booklore.model.entity.BookEntity;
import org.booklore.model.entity.BookMetadataEntity;
import org.booklore.repository.BookRepository;
import org.booklore.service.audit.AuditService;
import org.booklore.model.enums.MetadataReplaceMode;
import org.booklore.service.metadata.*;
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

        org.booklore.model.dto.Book mockBook = org.booklore.model.dto.Book.builder().metadata(new BookMetadata()).build();
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
        org.booklore.model.dto.Book mockBook = org.booklore.model.dto.Book.builder().metadata(new BookMetadata()).build();
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
        when(bookMetadataService.restoreTitlesFromFilename(request.getBookIds())).thenReturn(java.util.List.of(org.booklore.model.dto.Book.builder().build()));

        var response = metadataController.restoreTitlesFromFilenames(request);

        assertEquals(200, response.getStatusCode().value());
        assertEquals(1, response.getBody());
        verify(bookMetadataService).restoreTitlesFromFilename(request.getBookIds());
    }
}
