package org.fable.mapper;

import org.fable.model.dto.LibraryPath;
import org.fable.model.entity.LibraryPathEntity;
import org.mapstruct.Mapper;
import org.mapstruct.ReportingPolicy;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.IGNORE)
public interface LibraryPathMapper {

    LibraryPath toLibraryPath(LibraryPathEntity libraryPathEntity);
}
