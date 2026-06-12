package org.fable.mapper;

import org.fable.model.dto.Shelf;
import org.fable.model.entity.ShelfEntity;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
public interface ShelfMapper {

    @Mapping(source = "user.id", target = "userId")
    @Mapping(source = "public", target = "publicShelf")
    @Mapping(target = "bookCount", ignore = true)
    Shelf toShelf(ShelfEntity shelfEntity);
}
