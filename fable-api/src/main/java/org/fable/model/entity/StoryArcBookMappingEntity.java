package org.fable.model.entity;

import jakarta.persistence.*;
import org.hibernate.Hibernate;

import java.util.Objects;

@Entity
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
    private boolean isCore = false;

    @Column(name = "row_title")
    private String rowTitle;

    @Column(name = "external_url", columnDefinition = "TEXT")
    private String externalUrl;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "book_id", insertable = false, updatable = false)
    private BookEntity book;

    public StoryArcBookMappingEntity() {}

    public StoryArcBookMappingEntity(Long id, String storyArcName, Long bookId, int rowIndex, int colIndex, double sequenceOrder, boolean isCore, String rowTitle, String externalUrl, String description, BookEntity book) {
        this.id = id;
        this.storyArcName = storyArcName;
        this.bookId = bookId;
        this.rowIndex = rowIndex;
        this.colIndex = colIndex;
        this.sequenceOrder = sequenceOrder;
        this.isCore = isCore;
        this.rowTitle = rowTitle;
        this.externalUrl = externalUrl;
        this.description = description;
        this.book = book;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getStoryArcName() { return storyArcName; }
    public void setStoryArcName(String storyArcName) { this.storyArcName = storyArcName; }

    public Long getBookId() { return bookId; }
    public void setBookId(Long bookId) { this.bookId = bookId; }

    public int getRowIndex() { return rowIndex; }
    public void setRowIndex(int rowIndex) { this.rowIndex = rowIndex; }

    public int getColIndex() { return colIndex; }
    public void setColIndex(int colIndex) { this.colIndex = colIndex; }

    public double getSequenceOrder() { return sequenceOrder; }
    public void setSequenceOrder(double sequenceOrder) { this.sequenceOrder = sequenceOrder; }

    public boolean isCore() { return isCore; }
    public void setCore(boolean isCore) { this.isCore = isCore; }

    public String getRowTitle() { return rowTitle; }
    public void setRowTitle(String rowTitle) { this.rowTitle = rowTitle; }

    public String getExternalUrl() { return externalUrl; }
    public void setExternalUrl(String externalUrl) { this.externalUrl = externalUrl; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public BookEntity getBook() { return book; }
    public void setBook(BookEntity book) { this.book = book; }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private Long id;
        private String storyArcName;
        private Long bookId;
        private int rowIndex;
        private int colIndex;
        private double sequenceOrder;
        private boolean isCore = false;
        private String rowTitle;
        private String externalUrl;
        private String description;
        private BookEntity book;

        public Builder id(Long id) { this.id = id; return this; }
        public Builder storyArcName(String storyArcName) { this.storyArcName = storyArcName; return this; }
        public Builder bookId(Long bookId) { this.bookId = bookId; return this; }
        public Builder rowIndex(int rowIndex) { this.rowIndex = rowIndex; return this; }
        public Builder colIndex(int colIndex) { this.colIndex = colIndex; return this; }
        public Builder sequenceOrder(double sequenceOrder) { this.sequenceOrder = sequenceOrder; return this; }
        public Builder isCore(boolean isCore) { this.isCore = isCore; return this; }
        public Builder rowTitle(String rowTitle) { this.rowTitle = rowTitle; return this; }
        public Builder externalUrl(String externalUrl) { this.externalUrl = externalUrl; return this; }
        public Builder description(String description) { this.description = description; return this; }
        public Builder book(BookEntity book) { this.book = book; return this; }

        public StoryArcBookMappingEntity build() {
            return new StoryArcBookMappingEntity(id, storyArcName, bookId, rowIndex, colIndex, sequenceOrder, isCore, rowTitle, externalUrl, description, book);
        }
    }

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
