package com.adityachandel.booklore.controller;

import com.adityachandel.booklore.model.dto.Book;
import com.adityachandel.booklore.model.dto.Shelf;
import com.adityachandel.booklore.model.dto.request.ShelfCreateRequest;
import com.adityachandel.booklore.service.ShelfService;
import jakarta.validation.Valid;
import lombok.AllArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@AllArgsConstructor
@RestController
@RequestMapping(("/api/v1/shelves"))
public class ShelfController {

    private final ShelfService shelfService;

    @GetMapping
    public ResponseEntity<List<Shelf>> getAllShelves() {
        return ResponseEntity.ok(shelfService.getShelves());
    }

    @GetMapping("/{shelfId}")
    @PreAuthorize("@securityUtil.isShelfOwner(#shelfId)")
    public ResponseEntity<Shelf> getShelf(@PathVariable Long shelfId) {
        return ResponseEntity.ok(shelfService.getShelf(shelfId));
    }

    @PostMapping
    public ResponseEntity<Shelf> createShelf(@Valid @RequestBody ShelfCreateRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(shelfService.createShelf(request));
    }

    @PutMapping("/{shelfId}")
    @PreAuthorize("@securityUtil.isShelfOwner(#shelfId)")
    public ResponseEntity<Shelf> updateShelf(@Valid @RequestBody ShelfCreateRequest request, @PathVariable Long shelfId) {
        return ResponseEntity.ok(shelfService.updateShelf(shelfId, request));
    }

    @DeleteMapping("/{shelfId}")
    @PreAuthorize("@securityUtil.isShelfOwner(#shelfId)")
    public ResponseEntity<Void> deleteShelf(@PathVariable Long shelfId) {
        shelfService.deleteShelf(shelfId);
        return ResponseEntity.status(HttpStatus.NO_CONTENT).build();
    }

    @GetMapping("/{shelfId}/books")
    @PreAuthorize("@securityUtil.isShelfOwner(#shelfId)")
    public ResponseEntity<List<Book>> getShelfBooks(@PathVariable Long shelfId) {
        return ResponseEntity.ok(shelfService.getShelfBooks(shelfId));
    }
}
