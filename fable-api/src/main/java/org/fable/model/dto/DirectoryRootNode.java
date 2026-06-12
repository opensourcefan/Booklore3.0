package org.fable.model.dto;

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
public class DirectoryRootNode {
    private Long libraryId;
    private String libraryName;
    private Long libraryPathId;
    private String rootPath;
    private boolean hasRootBooks;
    private List<DirectoryNode> children;
}
