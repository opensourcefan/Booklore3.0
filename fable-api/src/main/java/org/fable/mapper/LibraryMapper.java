package org.fable.mapper;

import org.fable.model.dto.Library;
import org.fable.model.entity.LibraryEntity;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.ReportingPolicy;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.IGNORE)
public interface LibraryMapper {

    @Mapping(target = "paths", source = "libraryPaths")
    Library toLibrary(LibraryEntity libraryEntity);
}
