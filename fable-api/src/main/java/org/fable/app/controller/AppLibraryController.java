package org.fable.app.controller;

import org.fable.config.security.service.AuthenticationService;
import org.fable.app.dto.AppLibrarySummary;
import org.fable.app.mapper.AppBookMapper;
import org.fable.model.dto.FableUser;
import org.fable.model.entity.LibraryEntity;
import org.fable.repository.BookRepository;
import org.fable.service.library.LibraryVisibilityService;
import lombok.AllArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.stream.Collectors;

@AllArgsConstructor
@RestController
@RequestMapping("/api/v1/app/libraries")
public class AppLibraryController {

    private final AuthenticationService authenticationService;
    private final BookRepository bookRepository;
    private final AppBookMapper mobileBookMapper;
    private final LibraryVisibilityService libraryVisibilityService;

    @GetMapping
    public ResponseEntity<List<AppLibrarySummary>> getLibraries() {
        FableUser user = authenticationService.getAuthenticatedUser();
        List<LibraryEntity> libraries = libraryVisibilityService.getCatalogVisibleEntities(user);

        List<AppLibrarySummary> summaries = libraries.stream()
                .map(library -> {
                    long bookCount = bookRepository.countByLibraryId(library.getId());
                    return mobileBookMapper.toLibrarySummary(library, bookCount);
                })
                .collect(Collectors.toList());

        return ResponseEntity.ok(summaries);
    }
}
