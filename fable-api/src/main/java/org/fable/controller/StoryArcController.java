package org.fable.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.fable.model.dto.StoryArcBookMappingDto;
import org.fable.model.dto.StoryArcSummary;
import org.fable.model.dto.request.StoryArcBulkAddRequest;
import org.fable.model.dto.request.StoryArcLayoutUpdateRequest;
import org.fable.service.StoryArcService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/story-arcs")
@RequiredArgsConstructor
@Tag(name = "Story Arcs", description = "Endpoints for managing comic book story arcs and custom reading orders")
public class StoryArcController {

    private final StoryArcService storyArcService;

    @Operation(summary = "Get all story arcs", description = "Retrieve a list of all story arcs and their reading completion status.")
    @ApiResponse(responseCode = "200", description = "Story arcs returned successfully")
    @GetMapping
    public ResponseEntity<List<StoryArcSummary>> getStoryArcs() {
        return ResponseEntity.ok(storyArcService.getStoryArcs());
    }

    @Operation(summary = "Get a story arc layout", description = "Retrieve the book layout mappings and row coordinates for a specific story arc.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Story arc layout returned successfully"),
            @ApiResponse(responseCode = "404", description = "Story arc not found")
    })
    @GetMapping("/{name}")
    public ResponseEntity<List<StoryArcBookMappingDto>> getStoryArc(
        @Parameter(description = "Name of the story arc") @PathVariable String name
    ) {
        return ResponseEntity.ok(storyArcService.getStoryArc(name));
    }

    @Operation(summary = "Bulk add books to story arc", description = "Add a list of books to a story arc, appending them to the end of the last row.")
    @ApiResponse(responseCode = "201", description = "Books added to story arc successfully")
    @PostMapping("/bulk-add")
    @PreAuthorize("@securityUtil.canEditMetadata() or @securityUtil.isAdmin()")
    public ResponseEntity<Void> bulkAdd(
            @Valid @RequestBody StoryArcBulkAddRequest request
    ) {
        storyArcService.bulkAdd(request);
        return ResponseEntity.status(HttpStatus.CREATED).build();
    }

    @Operation(summary = "Update story arc layout", description = "Save row and column layout coordinates and core/tie-in settings for a story arc.")
    @ApiResponse(responseCode = "204", description = "Story arc layout updated successfully")
    @PutMapping("/{name}/layout")
    @PreAuthorize("@securityUtil.canEditMetadata() or @securityUtil.isAdmin()")
    public ResponseEntity<Void> saveLayout(
            @Parameter(description = "Name of the story arc") @PathVariable String name,
            @Valid @RequestBody StoryArcLayoutUpdateRequest request
    ) {
        storyArcService.saveLayout(name, request);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Delete story arc mapping", description = "Delete a story arc mapping entirely from all books.")
    @ApiResponse(responseCode = "204", description = "Story arc deleted successfully")
    @DeleteMapping("/{name}")
    @PreAuthorize("@securityUtil.canEditMetadata() or @securityUtil.isAdmin()")
    public ResponseEntity<Void> deleteStoryArc(
            @Parameter(description = "Name of the story arc") @PathVariable String name
    ) {
        storyArcService.deleteStoryArc(name);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Remove books from story arc", description = "Remove a list of books from a specific story arc.")
    @ApiResponse(responseCode = "204", description = "Books removed from story arc successfully")
    @DeleteMapping("/{name}/books")
    @PreAuthorize("@securityUtil.canEditMetadata() or @securityUtil.isAdmin()")
    public ResponseEntity<Void> removeBooksFromStoryArc(
            @Parameter(description = "Name of the story arc") @PathVariable String name,
            @RequestParam List<Long> bookIds
    ) {
        storyArcService.removeBooksFromStoryArc(name, bookIds);
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Fetch webpage metadata", description = "Fetch title and summary description from an external reading order guide URL.")
    @PostMapping("/fetch-metadata")
    @PreAuthorize("@securityUtil.canEditMetadata() or @securityUtil.isAdmin()")
    public ResponseEntity<org.fable.model.dto.StoryArcMetadataDto> fetchMetadata(
            @RequestBody java.util.Map<String, String> request
    ) {
        String url = request.get("url");
        if (url == null || url.isBlank()) {
            return ResponseEntity.badRequest().build();
        }
        return ResponseEntity.ok(storyArcService.fetchWebMetadata(url.trim()));
    }
}
