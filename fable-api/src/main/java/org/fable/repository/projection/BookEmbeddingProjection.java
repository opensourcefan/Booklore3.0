package org.fable.repository.projection;

public interface BookEmbeddingProjection {
    Long getBookId();
    String getEmbeddingVector();
    String getSeriesName();
}
