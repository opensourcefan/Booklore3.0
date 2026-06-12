package org.fable.mapper;

import org.fable.model.dto.BookReview;
import org.fable.model.entity.BookReviewEntity;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
public interface BookReviewMapper {

    BookReview toDto(BookReviewEntity entity);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "bookMetadata", ignore = true)
    BookReviewEntity toEntity(BookReview dto);
}

