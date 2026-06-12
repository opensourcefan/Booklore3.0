package org.fable.mapper;

import org.fable.model.dto.BookViewerSetting;
import org.fable.model.entity.PdfViewerPreferencesEntity;
import org.mapstruct.Mapper;
import org.mapstruct.ReportingPolicy;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.IGNORE)
public interface BookViewerSettingMapper {

    BookViewerSetting toBookViewerSetting(PdfViewerPreferencesEntity entity);

}
