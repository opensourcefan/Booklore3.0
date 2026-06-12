package org.fable.model.dto.request;

import com.fasterxml.jackson.annotation.JsonSetter;
import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.fasterxml.jackson.annotation.Nulls;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.fable.model.enums.TaskType;
import org.fable.task.options.DirectoryTagTaskOptions;
import org.fable.task.options.LibraryRescanOptions;
import org.fable.task.options.MetadataFlushOptions;
import tools.jackson.databind.ObjectMapper;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TaskCreateRequest {
    private String taskId;
    private TaskType taskType;
    @Builder.Default
    @JsonSetter(nulls = Nulls.SKIP)
    private boolean triggeredByCron = false;

    @JsonTypeInfo(use = JsonTypeInfo.Id.NAME, property = "taskType", include = JsonTypeInfo.As.EXTERNAL_PROPERTY)
    @JsonSubTypes({
            @JsonSubTypes.Type(value = LibraryRescanOptions.class, name = "REFRESH_LIBRARY_METADATA"),
            @JsonSubTypes.Type(value = DirectoryTagTaskOptions.class, name = "DIRECTORY_TAGGING"),
            @JsonSubTypes.Type(value = MetadataRefreshRequest.class, name = "REFRESH_METADATA_MANUAL"),
            @JsonSubTypes.Type(value = MetadataFlushOptions.class, name = "FLUSH_METADATA_TO_FILES"),
    })
    private Object options;

    public <T> T getOptionsAs(Class<T> optionsClass) {
        if (options == null) {
            return null;
        }
        if (optionsClass.isInstance(options)) {
            return optionsClass.cast(options);
        }
        ObjectMapper mapper = new ObjectMapper();
        return mapper.convertValue(options, optionsClass);
    }
}
