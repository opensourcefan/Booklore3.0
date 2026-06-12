package org.fable.mapper;

import org.fable.model.dto.Annotation;
import org.fable.model.entity.AnnotationEntity;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
public interface AnnotationMapper {

    @Mapping(source = "book.id", target = "bookId")
    @Mapping(source = "user.id", target = "userId")
    Annotation toDto(AnnotationEntity entity);
}
