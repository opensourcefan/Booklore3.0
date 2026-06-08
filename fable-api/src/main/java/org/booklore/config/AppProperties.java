package org.booklore.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "app")
@Getter
@Setter
public class AppProperties {
    private String pathConfig;
    private String bookdropFolder;
    private String version;
    private RemoteAuth remoteAuth;
    private Boolean forceDisableOidc = false;
    private Ai ai = new Ai();
    private AiSearch aiSearch = new AiSearch();

    /**
     * Type of disk storage where library files are stored.
     * Defaults to LOCAL. Set to NETWORK if using NFS, SMB/CIFS, or other network-mounted storage.
     * Some features like file move/reorganization are disabled on network storage due to
     * unreliable atomic operations that can cause data corruption or loss.
     */
    private String diskType = "LOCAL";

    public boolean isLocalStorage() {
        return "LOCAL".equalsIgnoreCase(diskType);
    }

    @Getter
    @Setter
    public static class RemoteAuth {
        private boolean enabled;
        private boolean createNewUsers;
        private String headerName;
        private String headerUser;
        private String headerEmail;
        private String headerGroups;
        private String adminGroup;
        private String groupsDelimiter = "\\s+";  // Default to whitespace for backward compatibility
    }

    @Getter
    @Setter
    public static class Ai {
        private String baseUrl = "http://app-ai-panel:8080";
        private int connectTimeoutMs = 3000;
        private int readTimeoutMs = 30000;
    }

    @Getter
    @Setter
    public static class AiSearch {
        private String baseUrl = "http://fable-ai-search:8080";
        private String embeddingModel = "BAAI/bge-small-en-v1.5";
        private int connectTimeoutMs = 3000;
        private int readTimeoutMs = 120000;
    }
}
