package org.fable.model.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.Hibernate;

import java.util.Objects;

@Entity
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Table(name = "story_arc_book_mapping")
public class StoryArcBookMappingEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "story_arc_name", nullable = false)
    private String storyArcName;

    @Column(name = "book_id", nullable = false)
    private Long bookId;

    @Column(name = "row_index", nullable = false)
    private int rowIndex;

    @Column(name = "col_index", nullable = false)
    private int colIndex;

    @Column(name = "sequence_order", nullable = false)
    private double sequenceOrder;

    @Column(name = "is_core", nullable = false)
    @Builder.Default
    private boolean isCore = false;

    @Column(name = "row_title")
    private String rowTitle;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "book_id", insertable = false, updatable = false)
    private BookEntity book;

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || Hibernate.getClass(this) != Hibernate.getClass(o)) return false;
        StoryArcBookMappingEntity that = (StoryArcBookMappingEntity) o;
        return id != null && Objects.equals(id, that.id);
    }

    @Override
    public int hashCode() {
        return Hibernate.getClass(this).hashCode();
    }
}
