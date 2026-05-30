package org.booklore.model.dto.request;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.util.ArrayList;

import static org.assertj.core.api.Assertions.assertThat;

class MetadataRefreshRequestTest {

    @Test
    void deserializesBookIdsInRequestOrder() throws Exception {
        ObjectMapper objectMapper = new ObjectMapper();
        String json = """
                {
                  \"refreshType\": \"BOOKS\",
                  \"bookIds\": [46, 47]
                }
                """;

        MetadataRefreshRequest request = objectMapper.readValue(json, MetadataRefreshRequest.class);

        assertThat(new ArrayList<>(request.getBookIds())).containsExactly(46L, 47L);
    }
}
