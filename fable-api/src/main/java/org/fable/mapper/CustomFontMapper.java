package org.fable.mapper;

import org.fable.model.dto.CustomFontDto;
import org.fable.model.entity.CustomFontEntity;
import org.mapstruct.Mapper;

@Mapper(componentModel = "spring")
public interface CustomFontMapper {

    CustomFontDto toDto(CustomFontEntity entity);
}
