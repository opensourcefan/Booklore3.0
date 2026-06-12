package org.fable.mapper;

import org.fable.model.dto.BookMetadata;
import org.fable.model.dto.BookdropFile;
import org.fable.model.entity.BookdropFileEntity;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.Named;

@Mapper(componentModel = "spring")
public interface BookdropFileMapper {

    @Mapping(target = "originalMetadata", source = "originalMetadata", qualifiedByName = "jsonToBookMetadata")
    @Mapping(target = "fetchedMetadata", source = "fetchedMetadata", qualifiedByName = "jsonToBookMetadata")
    BookdropFile toDto(BookdropFileEntity entity);

    @Named("jsonToBookMetadata")
    default BookMetadata jsonToBookMetadata(String json) {
        if (json == null || json.isBlank()) return null;
        return JsonMetadataMapper.parse(json);
    }
}