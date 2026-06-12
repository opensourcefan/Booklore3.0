package org.fable.model.dto;

import org.fable.model.enums.BookFileType;
import org.fable.model.enums.DirectoryTagDepth;
import org.fable.model.enums.IconType;
import org.fable.model.enums.LibraryOrganizationMode;
import org.fable.model.enums.MetadataSource;
import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Builder
@Data
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class Library {
    private Long id;
    private String name;
    private Sort sort;
    private String icon;
    private IconType iconType;
    private String fileNamingPattern;
    private boolean watch;
    private List<LibraryPath> paths;
    private List<BookFileType> formatPriority;
    private List<BookFileType> allowedFormats;
    private LibraryOrganizationMode organizationMode;
    private MetadataSource metadataSource;
    private boolean tagByDirectory;
    private DirectoryTagDepth directoryTagDepth;
}

