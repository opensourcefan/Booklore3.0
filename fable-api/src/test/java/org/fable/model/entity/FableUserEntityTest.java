package org.fable.model.entity;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class FableUserEntityTest {

    @Test
    void builderShouldInitializeCollections() {
        FableUserEntity user = FableUserEntity.builder().isDefaultPassword(false).build();

        assertThat(user.getShelves())
                .isNotNull()
                .isEmpty(); 
        assertThat(user.getSettings())
                .isNotNull()
                .isEmpty();

        assertThat(user.isDefaultPassword()).isFalse();

        FableUserEntity defaultUser = FableUserEntity.builder().isDefaultPassword(false).build();
        assertThat(defaultUser.isDefaultPassword()).isFalse();
    }
}