package org.fable.model.dto;

import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;

class MetadataBatchProgressNotificationJacksonTest {
    @Test
    void serializesPhaseAndReview() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        MetadataBatchProgressNotification n = new MetadataBatchProgressNotification(
                "t1", 0, 2, "ISBN fetch — book 1 of 2…", "IN_PROGRESS", false, false, null,
                MetadataBatchProgressNotification.PHASE_ISBN_DISCOVERY);
        String json = mapper.writeValueAsString(n);
        System.out.println("JSON=" + json);
        assertThat(json).contains("\"phase\":\"ISBN_DISCOVERY\"");
        assertThat(json).containsAnyOf("\"review\":false", "\"isReview\":false");
    }
}
