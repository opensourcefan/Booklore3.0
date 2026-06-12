package org.fable.service.metadata;

import org.fable.model.dto.CoverImage;
import org.fable.model.dto.request.CoverFetchRequest;

import java.util.List;

public interface BookCoverProvider {
    List<CoverImage> getCovers(CoverFetchRequest request);
}

