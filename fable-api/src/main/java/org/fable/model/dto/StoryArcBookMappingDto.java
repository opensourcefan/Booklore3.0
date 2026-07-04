package org.fable.model.dto;

public class StoryArcBookMappingDto {
    private Long id;
    private String storyArcName;
    private Long bookId;
    private int rowIndex;
    private int colIndex;
    private double sequenceOrder;
    private boolean isCore;
    private String rowTitle;
    private String externalUrl;
    private String description;
    private Long coverBookId;
    private Book book;

    public StoryArcBookMappingDto() {}

    public StoryArcBookMappingDto(Long id, String storyArcName, Long bookId, int rowIndex, int colIndex, double sequenceOrder, boolean isCore, String rowTitle, String externalUrl, String description, Long coverBookId, Book book) {
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
        this.coverBookId = coverBookId;
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

    public Long getCoverBookId() { return coverBookId; }
    public void setCoverBookId(Long coverBookId) { this.coverBookId = coverBookId; }

    public Book getBook() { return book; }
    public void setBook(Book book) { this.book = book; }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private Long id;
        private String storyArcName;
        private Long bookId;
        private int rowIndex;
        private int colIndex;
        private double sequenceOrder;
        private boolean isCore;
        private String rowTitle;
        private String externalUrl;
        private String description;
        private Long coverBookId;
        private Book book;

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
        public Builder coverBookId(Long coverBookId) { this.coverBookId = coverBookId; return this; }
        public Builder book(Book book) { this.book = book; return this; }

        public StoryArcBookMappingDto build() {
            return new StoryArcBookMappingDto(id, storyArcName, bookId, rowIndex, colIndex, sequenceOrder, isCore, rowTitle, externalUrl, description, coverBookId, book);
        }
    }
}
