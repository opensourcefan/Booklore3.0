package org.fable.controller;

import org.fable.config.security.annotation.CheckBookAccess;
import org.fable.model.dto.BookFile;
import org.fable.model.dto.request.DetachBookFileRequest;
import org.fable.model.dto.response.DetachBookFileResponse;
import org.fable.model.enums.BookFileType;
import org.fable.service.book.BookFileDetachmentService;
import org.fable.service.file.AdditionalFileService;
import org.fable.service.upload.FileUploadService;
import lombok.AllArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

@RequestMapping("/api/v1/books/{bookId}/files")
@RestController
@AllArgsConstructor
public class AdditionalFileController {

    private final AdditionalFileService additionalFileService;
    private final FileUploadService fileUploadService;
    private final BookFileDetachmentService bookFileDetachmentService;

    @GetMapping
    @CheckBookAccess(bookIdParam = "bookId")
    public ResponseEntity<List<BookFile>> getAdditionalFiles(@PathVariable Long bookId) {
        List<BookFile> files = additionalFileService.getAdditionalFilesByBookId(bookId);
        return ResponseEntity.ok(files);
    }

    @GetMapping(params = "isBook")
    @CheckBookAccess(bookIdParam = "bookId")
    public ResponseEntity<List<BookFile>> getFilesByIsBook(
            @PathVariable Long bookId,
            @RequestParam boolean isBook) {
        List<BookFile> files = additionalFileService.getAdditionalFilesByBookIdAndIsBook(bookId, isBook);
        return ResponseEntity.ok(files);
    }

    @PostMapping(consumes = "multipart/form-data")
    @CheckBookAccess(bookIdParam = "bookId")
    @PreAuthorize("@securityUtil.canUpload() or @securityUtil.isAdmin()")
    public ResponseEntity<BookFile> uploadAdditionalFile(
            @PathVariable Long bookId,
            @RequestParam("file") MultipartFile file,
            @RequestParam boolean isBook,
            @RequestParam(required = false) BookFileType bookType,
            @RequestParam(required = false) String description) {
        BookFile additionalFile = fileUploadService.uploadAdditionalFile(bookId, file, isBook, bookType, description);
        return ResponseEntity.ok(additionalFile);
    }

    @GetMapping("/{fileId}/download")
    @CheckBookAccess(bookIdParam = "bookId")
    public ResponseEntity<Resource> downloadAdditionalFile(
            @PathVariable Long bookId,
            @PathVariable Long fileId) throws IOException {
        return additionalFileService.downloadAdditionalFile(fileId);
    }

    @DeleteMapping("/{fileId}")
    @CheckBookAccess(bookIdParam = "bookId")
    @PreAuthorize("@securityUtil.canDeleteBook() or @securityUtil.isAdmin()")
    public ResponseEntity<Void> deleteAdditionalFile(
            @PathVariable Long bookId,
            @PathVariable Long fileId) {
        additionalFileService.deleteAdditionalFile(fileId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{fileId}/detach")
    @CheckBookAccess(bookIdParam = "bookId")
    @PreAuthorize("@securityUtil.canManageLibrary() or @securityUtil.isAdmin()")
    public ResponseEntity<DetachBookFileResponse> detachFile(
            @PathVariable Long bookId,
            @PathVariable Long fileId,
            @RequestBody DetachBookFileRequest request) {
        return ResponseEntity.ok(bookFileDetachmentService.detachBookFile(bookId, fileId, request.copyMetadata()));
    }
}
