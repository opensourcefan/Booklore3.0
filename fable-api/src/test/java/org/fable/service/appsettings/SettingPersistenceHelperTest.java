package org.fable.service.appsettings;

import org.fable.model.dto.request.MetadataRefreshOptions;
import org.fable.repository.AppSettingsRepository;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class SettingPersistenceHelperTest {

    @Test
    void defaultsDisableGenreMergingAndEnableManualReview() {
        SettingPersistenceHelper helper = new SettingPersistenceHelper(mock(AppSettingsRepository.class), new ObjectMapper());

        MetadataRefreshOptions options = helper.getDefaultMetadataRefreshOptions();

        assertThat(options.isMergeCategories()).isFalse();
        assertThat(options.getReviewBeforeApply()).isTrue();
    }
}