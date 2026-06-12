package org.fable.mapper;

import org.fable.model.dto.PdfViewerPreferences;
import org.fable.model.entity.PdfViewerPreferencesEntity;
import org.mapstruct.Mapper;
import org.mapstruct.ReportingPolicy;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.IGNORE)
public interface PdfViewerPreferencesMapper {

    PdfViewerPreferences toModel(PdfViewerPreferencesEntity entity);

    PdfViewerPreferencesEntity toEntity(PdfViewerPreferences model);
}
