package org.fable.model.dto.request;

import java.util.List;

public class StoryArcLayoutUpdateRequest {
    private String storyArcName;
    private String externalUrl;
    private String description;
    private List<LayoutItem> items;
    private List<String> rowTitles;

    public StoryArcLayoutUpdateRequest() {}

    public StoryArcLayoutUpdateRequest(String storyArcName, String externalUrl, String description, List<LayoutItem> items, List<String> rowTitles) {
        this.storyArcName = storyArcName;
        this.externalUrl = externalUrl;
        this.description = description;
        this.items = items;
        this.rowTitles = rowTitles;
    }

    public String getStoryArcName() { return storyArcName; }
    public void setStoryArcName(String storyArcName) { this.storyArcName = storyArcName; }

    public String getExternalUrl() { return externalUrl; }
    public void setExternalUrl(String externalUrl) { this.externalUrl = externalUrl; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public List<LayoutItem> getItems() { return items; }
    public void setItems(List<LayoutItem> items) { this.items = items; }

    public List<String> getRowTitles() { return rowTitles; }
    public void setRowTitles(List<String> rowTitles) { this.rowTitles = rowTitles; }

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private String storyArcName;
        private String externalUrl;
        private String description;
        private List<LayoutItem> items;
        private List<String> rowTitles;

        public Builder storyArcName(String storyArcName) { this.storyArcName = storyArcName; return this; }
        public Builder externalUrl(String externalUrl) { this.externalUrl = externalUrl; return this; }
        public Builder description(String description) { this.description = description; return this; }
        public Builder items(List<LayoutItem> items) { this.items = items; return this; }
        public Builder rowTitles(List<String> rowTitles) { this.rowTitles = rowTitles; return this; }

        public StoryArcLayoutUpdateRequest build() {
            return new StoryArcLayoutUpdateRequest(storyArcName, externalUrl, description, items, rowTitles);
        }
    }

    public static class LayoutItem {
        private Long bookId;
        private int rowIndex;
        private int colIndex;
        private double sequenceOrder;
        private boolean isCore;
        private String rowTitle;
        private String externalUrl;
        private String description;

        public LayoutItem() {}

        public LayoutItem(Long bookId, int rowIndex, int colIndex, double sequenceOrder, boolean isCore, String rowTitle, String externalUrl, String description) {
            this.bookId = bookId;
            this.rowIndex = rowIndex;
            this.colIndex = colIndex;
            this.sequenceOrder = sequenceOrder;
            this.isCore = isCore;
            this.rowTitle = rowTitle;
            this.externalUrl = externalUrl;
            this.description = description;
        }

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

        public static LayoutItemBuilder builder() { return new LayoutItemBuilder(); }

        public static class LayoutItemBuilder {
            private Long bookId;
            private int rowIndex;
            private int colIndex;
            private double sequenceOrder;
            private boolean isCore;
            private String rowTitle;
            private String externalUrl;
            private String description;

            public LayoutItemBuilder bookId(Long bookId) { this.bookId = bookId; return this; }
            public LayoutItemBuilder rowIndex(int rowIndex) { this.rowIndex = rowIndex; return this; }
            public LayoutItemBuilder colIndex(int colIndex) { this.colIndex = colIndex; return this; }
            public LayoutItemBuilder sequenceOrder(double sequenceOrder) { this.sequenceOrder = sequenceOrder; return this; }
            public LayoutItemBuilder isCore(boolean isCore) { this.isCore = isCore; return this; }
            public LayoutItemBuilder rowTitle(String rowTitle) { this.rowTitle = rowTitle; return this; }
            public LayoutItemBuilder externalUrl(String externalUrl) { this.externalUrl = externalUrl; return this; }
            public LayoutItemBuilder description(String description) { this.description = description; return this; }

            public LayoutItem build() {
                return new LayoutItem(bookId, rowIndex, colIndex, sequenceOrder, isCore, rowTitle, externalUrl, description);
            }
        }
    }
}
