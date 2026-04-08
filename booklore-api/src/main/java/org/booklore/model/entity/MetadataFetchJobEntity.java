package org.booklore.model.entity;

import org.booklore.convertor.LongListJsonConverter;
import org.booklore.model.enums.MetadataFetchTaskStatus;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "metadata_fetch_jobs")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MetadataFetchJobEntity {

    @Id
    @Column(name = "task_id", length = 100)
    private String taskId;

    @Column(name = "user_id")
    private Long userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private MetadataFetchTaskStatus status;

    @Column(name = "status_message", columnDefinition = "TEXT")
    private String statusMessage;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "total_books_count")
    private Integer totalBooksCount;

    @Column(name = "completed_books")
    private Integer completedBooks;

    @Convert(converter = LongListJsonConverter.class)
    @Column(name = "requested_book_ids", columnDefinition = "LONGTEXT")
    @Builder.Default
    private List<Long> requestedBookIds = new ArrayList<>();

    @Convert(converter = LongListJsonConverter.class)
    @Column(name = "completed_book_ids", columnDefinition = "LONGTEXT")
    @Builder.Default
    private List<Long> completedBookIds = new ArrayList<>();

    @OneToMany(mappedBy = "job", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @Builder.Default
    private List<MetadataFetchProposalEntity> proposals = new ArrayList<>();
}