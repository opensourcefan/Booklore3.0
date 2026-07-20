package org.fable.model.dto.settings;

import org.fable.model.dto.request.MetadataRefreshOptions;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@AllArgsConstructor
@NoArgsConstructor
public class AppSettings {
    private MetadataRefreshOptions defaultMetadataRefreshOptions;
    private List<MetadataRefreshOptions> libraryMetadataRefreshOptions;
    private boolean autoBookSearch;
    private boolean similarBookRecommendation;
    private boolean opdsServerEnabled;
    private boolean komgaApiEnabled;
    private boolean komgaGroupUnknown;
    private String uploadPattern;
    private Integer pdfCacheSizeInMb;
    private Integer maxFileUploadSizeInMb;
    private boolean remoteAuthEnabled;
    private boolean metadataDownloadOnBookdrop;
    private boolean isbnDiscoveryEnabled;
    private boolean isbnDiscoveryOnBookdrop;
    private boolean isbnDiscoveryOnLibraryScan;
    private Integer maxFrontMatterPages;
    private boolean useOcrForIsbnDiscovery;
    private String isbnAmbiguityPolicy;
    private boolean isbnFetchReviewBeforeApply;
    private String isbnFillMode;
    private boolean isbnFileWriteBackEnabled;
    private boolean oidcEnabled;
    private boolean aiPanelDetectionEnabled;
    private boolean aiSearchEnabled;
    private OidcProviderDetails oidcProviderDetails;
    private OidcAutoProvisionDetails oidcAutoProvisionDetails;
    private MetadataProviderSettings metadataProviderSettings;
    private MetadataMatchWeights metadataMatchWeights;
    private MetadataPersistenceSettings metadataPersistenceSettings;
    private MetadataPublicReviewsSettings metadataPublicReviewsSettings;
    private KoboSettings koboSettings;
    private CoverCroppingSettings coverCroppingSettings;
    private MetadataProviderSpecificFields metadataProviderSpecificFields;
    private Integer oidcSessionDurationHours;
    private String oidcGroupSyncMode;
    private boolean oidcForceOnlyMode;
    private List<String> oidcRedirectUris;
    private String diskType;
    private Integer libraryHealthCheckIntervalSeconds;
    private boolean allowFileDeletion;
    private AiPanelSettings aiPanelSettings;
    private AiSearchSettings aiSearchSettings;
    private List<AiLlmProfile> aiLlmProfiles;
}