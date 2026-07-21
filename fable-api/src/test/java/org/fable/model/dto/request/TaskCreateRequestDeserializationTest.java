package org.fable.model.dto.request;

import org.fable.model.enums.MetadataProvider;
import org.fable.model.enums.TaskType;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;

class TaskCreateRequestDeserializationTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void deserializesIsbnDiscoveryOptions() throws Exception {
        String json = """
                {
                  "taskType": "ISBN_DISCOVERY",
                  "triggeredByCron": false,
                  "options": {
                    "bookIds": [12, 34],
                    "providers": ["Google", "Hardcover"]
                  }
                }
                """;

        TaskCreateRequest request = objectMapper.readValue(json, TaskCreateRequest.class);

        assertThat(request.getTaskType()).isEqualTo(TaskType.ISBN_DISCOVERY);
        IsbnDiscoveryRequest options = request.getOptionsAs(IsbnDiscoveryRequest.class);
        assertThat(options).isNotNull();
        assertThat(options.getBookIds()).containsExactly(12L, 34L);
        assertThat(options.getProviders())
                .containsExactly(MetadataProvider.Google, MetadataProvider.Hardcover);
    }
}
