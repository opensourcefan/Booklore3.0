package org.fable.mapper;

import org.fable.model.dto.BookMark;
import org.fable.model.entity.BookMarkEntity;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
public interface BookMarkMapper {

    @Mapping(source = "book.id", target = "bookId")
    @Mapping(source = "user.id", target = "userId")
    BookMark toDto(BookMarkEntity entity);
}
