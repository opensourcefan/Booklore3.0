package org.fable.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.AllArgsConstructor;
import org.fable.config.security.annotation.CheckLibraryAccess;
import org.fable.model.dto.DirectoryRootNode;
import org.fable.service.library.DirectoryTreeService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/libraries")
@AllArgsConstructor
@Tag(name = "Directory Tree", description = "Endpoints for browsing library directory structures")
public class DirectoryTreeController {

    private final DirectoryTreeService directoryTreeService;

    @Operation(summary = "Get directory tree for a library", description = "Returns the folder structure for all paths of the given library.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Directory tree returned successfully"),
            @ApiResponse(responseCode = "404", description = "Library not found")
    })
    @GetMapping("/{libraryId}/directory-tree")
    @CheckLibraryAccess(libraryIdParam = "libraryId")
    public ResponseEntity<List<DirectoryRootNode>> getDirectoryTree(
            @Parameter(description = "ID of the library") @PathVariable long libraryId) {
        return ResponseEntity.ok(directoryTreeService.getTreeForLibrary(libraryId));
    }

    @Operation(summary = "Get directory tree for all accessible libraries", description = "Returns the folder structure for all libraries the current user can access.")
    @ApiResponse(responseCode = "200", description = "Directory trees returned successfully")
    @GetMapping("/directory-tree")
    public ResponseEntity<List<DirectoryRootNode>> getAllLibrariesDirectoryTree() {
        return ResponseEntity.ok(directoryTreeService.getTreeForAllUserLibraries());
    }
}
