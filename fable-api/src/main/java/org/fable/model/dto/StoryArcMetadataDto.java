package org.fable.model.dto;

public class StoryArcMetadataDto {
    private String externalUrl;
    private String scrapedTitle;
    private String scrapedDescription;

    public StoryArcMetadataDto() {}

    public StoryArcMetadataDto(String externalUrl, String scrapedTitle, String scrapedDescription) {
        this.externalUrl = externalUrl;
        this.scrapedTitle = scrapedTitle;
        this.scrapedDescription = scrapedDescription;
    }

    public String getExternalUrl() {
        return externalUrl;
    }

    public void setExternalUrl(String externalUrl) {
        this.externalUrl = externalUrl;
    }

    public String getScrapedTitle() {
        return scrapedTitle;
    }

    public void setScrapedTitle(String scrapedTitle) {
        this.scrapedTitle = scrapedTitle;
    }

    public String getScrapedDescription() {
        return scrapedDescription;
    }

    public void setScrapedDescription(String scrapedDescription) {
        this.scrapedDescription = scrapedDescription;
    }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private String externalUrl;
        private String scrapedTitle;
        private String scrapedDescription;

        public Builder externalUrl(String externalUrl) {
            this.externalUrl = externalUrl;
            return this;
        }

        public Builder scrapedTitle(String scrapedTitle) {
            this.scrapedTitle = scrapedTitle;
            return this;
        }

        public Builder scrapedDescription(String scrapedDescription) {
            this.scrapedDescription = scrapedDescription;
            return this;
        }

        public StoryArcMetadataDto build() {
            return new StoryArcMetadataDto(externalUrl, scrapedTitle, scrapedDescription);
        }
    }
}
