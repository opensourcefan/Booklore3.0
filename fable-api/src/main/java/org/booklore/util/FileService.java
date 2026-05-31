package org.booklore.util;

import org.booklore.config.AppProperties;
import org.booklore.exception.ApiError;
import org.booklore.model.dto.settings.CoverCroppingSettings;
import org.booklore.model.entity.BookMetadataEntity;
import org.booklore.service.appsettings.AppSettingService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.Comparator;
import java.util.Iterator;
import java.util.Set;
import java.util.stream.Stream;

@Slf4j
@RequiredArgsConstructor
@Service
public class FileService {

    private final AppProperties appProperties;
    private final AppSettingService appSettingService;
    private final RestTemplate noRedirectRestTemplate;

    private static final int MAX_REDIRECTS = 5;


    private static final double TARGET_COVER_ASPECT_RATIO = 1.5;
    private static final int SMART_CROP_COLOR_TOLERANCE = 30;
    private static final double SMART_CROP_MARGIN_PERCENT = 0.02;

    // @formatter:off
    private static final String IMAGES_DIR                    = "images";
    private static final String AUTHOR_IMAGES_DIR             = "author-images";
    private static final String BACKGROUNDS_DIR               = "backgrounds";
    private static final String ICONS_DIR                     = "icons";
    private static final String SVG_DIR                       = "svg";
    private static final String THUMBNAIL_FILENAME            = "thumbnail.jpg";
    private static final String THUMBNAIL_WEBP_FILENAME       = "thumbnail.webp";
    private static final String COVER_FILENAME                = "cover.jpg";
    private static final String AUTHOR_PHOTO_FILENAME         = "photo.jpg";
    private static final String AUTHOR_THUMBNAIL_FILENAME     = "thumbnail.jpg";
    private static final String AUDIOBOOK_THUMBNAIL_FILENAME  = "audiobook-thumbnail.jpg";
    private static final String AUDIOBOOK_THUMBNAIL_WEBP_FILENAME = "audiobook-thumbnail.webp";
    private static final String AUDIOBOOK_COVER_FILENAME      = "audiobook-cover.jpg";
    private static final String JPEG_MIME_TYPE                = "image/jpeg";
    private static final String PNG_MIME_TYPE                 = "image/png";
    private static final long   MAX_FILE_SIZE_BYTES           = 5L * 1024 * 1024;
    // 20 MP covers all legitimate book covers and author photos (e.g., 2842×4221 ≈ 12 MP).
    private static final long   MAX_IMAGE_PIXELS              = 20_000_000L;
    private static final int    THUMBNAIL_WIDTH               = 250;
    private static final int    THUMBNAIL_HEIGHT              = 350;
    private static final int    SQUARE_THUMBNAIL_SIZE         = 250;
    private static final int    MAX_ORIGINAL_WIDTH            = 1000;
    private static final int    MAX_ORIGINAL_HEIGHT           = 1500;
    private static final int    MAX_SQUARE_SIZE               = 1000;
    private static final String IMAGE_FORMAT                  = "JPEG";
    private static final String WEBP_IMAGE_FORMAT             = "webp";
    // @formatter:on

    // ========================================
    // PATH UTILITIES
    // ========================================

    public String getImagesFolder(long bookId) {
        return Paths.get(appProperties.getPathConfig(), IMAGES_DIR, String.valueOf(bookId)).toString();
    }

    public String getThumbnailFile(long bookId) {
        return Paths.get(appProperties.getPathConfig(), IMAGES_DIR, String.valueOf(bookId), THUMBNAIL_FILENAME).toString();
    }

    public String getThumbnailWebpFile(long bookId) {
        return Paths.get(appProperties.getPathConfig(), IMAGES_DIR, String.valueOf(bookId), THUMBNAIL_WEBP_FILENAME).toString();
    }

    public String getCoverFile(long bookId) {
        return Paths.get(appProperties.getPathConfig(), IMAGES_DIR, String.valueOf(bookId), COVER_FILENAME).toString();
    }

    public String getAudiobookThumbnailFile(long bookId) {
        return Paths.get(appProperties.getPathConfig(), IMAGES_DIR, String.valueOf(bookId), AUDIOBOOK_THUMBNAIL_FILENAME).toString();
    }

    public String getAudiobookThumbnailWebpFile(long bookId) {
        return Paths.get(appProperties.getPathConfig(), IMAGES_DIR, String.valueOf(bookId), AUDIOBOOK_THUMBNAIL_WEBP_FILENAME).toString();
    }

    public String getAudiobookCoverFile(long bookId) {
        return Paths.get(appProperties.getPathConfig(), IMAGES_DIR, String.valueOf(bookId), AUDIOBOOK_COVER_FILENAME).toString();
    }

    public String getAuthorImagesFolder(long authorId) {
        return Paths.get(appProperties.getPathConfig(), AUTHOR_IMAGES_DIR, String.valueOf(authorId)).toString();
    }

    public String getAuthorPhotoFile(long authorId) {
        return Paths.get(appProperties.getPathConfig(), AUTHOR_IMAGES_DIR, String.valueOf(authorId), AUTHOR_PHOTO_FILENAME).toString();
    }

    public String getAuthorThumbnailFile(long authorId) {
        return Paths.get(appProperties.getPathConfig(), AUTHOR_IMAGES_DIR, String.valueOf(authorId), AUTHOR_THUMBNAIL_FILENAME).toString();
    }

    public String getBackgroundsFolder(Long userId) {
        if (userId != null) {
            return Paths.get(appProperties.getPathConfig(), BACKGROUNDS_DIR, "user-" + userId).toString();
        }
        return Paths.get(appProperties.getPathConfig(), BACKGROUNDS_DIR).toString();
    }

    public String getBackgroundsFolder() {
        return getBackgroundsFolder(null);
    }

    public static String getBackgroundUrl(String filename, Long userId) {
        if (userId != null) {
            return Paths.get("/", BACKGROUNDS_DIR, "user-" + userId, filename).toString().replace("\\", "/");
        }
        return Paths.get("/", BACKGROUNDS_DIR, filename).toString().replace("\\", "/");
    }

    public String getBookMetadataBackupPath(long bookId) {
        return Paths.get(appProperties.getPathConfig(), "metadata_backup", String.valueOf(bookId)).toString();
    }

    public String getPdfCachePath() {
        return Paths.get(appProperties.getPathConfig(), "pdf_cache").toString();
    }

    public String getTempBookdropCoverImagePath(long bookdropFileId) {
        return Paths.get(appProperties.getPathConfig(), "bookdrop_temp", bookdropFileId + ".jpg").toString();
    }

    public String getToolsKepubifyPath() {
        return Paths.get(appProperties.getPathConfig(), "tools", "kepubify").toString();
    }

    public String getToolsFfprobePath() {
        return Paths.get(appProperties.getPathConfig(), "tools", "ffprobe").toString();
    }


    // ========================================
    // VALIDATION
    // ========================================

    private static void validateCoverFile(MultipartFile file) {
        if (file.isEmpty()) {
            throw new IllegalArgumentException("Uploaded file is empty");
        }
        String contentType = file.getContentType();
        if (contentType == null) {
            throw new IllegalArgumentException("Content type is required");
        }
        String lowerType = contentType.toLowerCase();
        if (!lowerType.startsWith(JPEG_MIME_TYPE) && !lowerType.startsWith(PNG_MIME_TYPE)) {
            throw new IllegalArgumentException("Only JPEG and PNG files are allowed");
        }
        if (file.getSize() > MAX_FILE_SIZE_BYTES) {
            throw new IllegalArgumentException("File size must not exceed 5 MB");
        }
    }

    // ========================================
    // IMAGE OPERATIONS
    // ========================================

    public static BufferedImage readImage(InputStream inputStream) throws IOException {
        return readImage(inputStream.readAllBytes());
    }

    public static BufferedImage readImage(byte[] imageData) throws IOException {
        if (imageData == null || imageData.length == 0) {
            throw new IOException("Image data is null or empty");
        }

        try (ImageInputStream iis = ImageIO.createImageInputStream(new ByteArrayInputStream(imageData))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(iis);
            if (readers.hasNext()) {
                ImageReader reader = readers.next();
                try {
                    reader.setInput(iis);
                    int width = reader.getWidth(0);
                    int height = reader.getHeight(0);

                    long pixelCount = (long) width * height;
                    if (pixelCount > MAX_IMAGE_PIXELS) {
                        throw new IOException(String.format("Rejected image: dimensions %dx%d (%d pixels) exceed limit %d — possible decompression bomb",
                                width, height, pixelCount, MAX_IMAGE_PIXELS));
                    }

                    return reader.read(0);
                } finally {
                    reader.dispose();
                }
            }
        } catch (IOException e) {
            throw e;
        } catch (Exception e) {
            throw new IOException("ImageIO decode failed (possibly unsupported format): " + e.getMessage(), e);
        }

        throw new IOException("Unable to decode image, likely unsupported format");
    }

    public static BufferedImage resizeImage(BufferedImage originalImage, int width, int height) {
        BufferedImage resizedImage = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g2d = resizedImage.createGraphics();
        try {
            g2d.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
            g2d.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            g2d.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g2d.drawImage(originalImage, 0, 0, width, height, null);
        } finally {
            g2d.dispose();
        }
        return resizedImage;
    }

    public static void saveImage(byte[] imageData, String filePath) throws IOException {
        BufferedImage originalImage = null;
        try {
            originalImage = readImage(imageData);
            if (originalImage == null) {
                log.warn("Skipping saveImage for {}: decoded image is null", filePath);
                return;
            }
            File outputFile = new File(filePath);
            File parentDir = outputFile.getParentFile();
            if (!parentDir.exists() && !parentDir.mkdirs()) {
                throw new IOException("Failed to create directory: " + parentDir);
            }
            ImageIO.write(originalImage, IMAGE_FORMAT, outputFile);
            log.info("Image saved successfully to: {}", filePath);
        } finally {
            if (originalImage != null) {
                originalImage.flush(); // Release native resources
            }
        }
    }

    public BufferedImage downloadImageFromUrl(String imageUrl) throws IOException {
        try {
            return downloadImageFromUrlInternal(imageUrl);
        } catch (Exception e) {
            log.warn("Failed to download image from {}: {}", imageUrl, e.getMessage());
            if (e instanceof IOException ioException) {
                throw ioException;
            }
            throw new IOException("Failed to download image from " + imageUrl + ": " + e.getMessage(), e);
        }
    }

    private BufferedImage downloadImageFromUrlInternal(String imageUrl) throws IOException {
        String currentUrl = imageUrl;
        int redirectCount = 0;

        while (redirectCount <= MAX_REDIRECTS) {
            URI uri = URI.create(currentUrl);
            if (!"http".equalsIgnoreCase(uri.getScheme()) && !"https".equalsIgnoreCase(uri.getScheme())) {
                throw new IOException("Only HTTP and HTTPS protocols are allowed");
            }

            String host = uri.getHost();
            if (host == null) {
                throw new IOException("Invalid URL: no host found in " + currentUrl);
            }

            // Validate resolved IPs to block SSRF against internal networks
            InetAddress[] inetAddresses = InetAddress.getAllByName(host);
            if (inetAddresses.length == 0) {
                throw new IOException("Could not resolve host: " + host);
            }
            for (InetAddress inetAddress : inetAddresses) {
                if (isInternalAddress(inetAddress)) {
                    throw new SecurityException("URL points to a local or private internal network address: " + host + " (" + inetAddress.getHostAddress() + ")");
                }
            }

            HttpHeaders headers = new HttpHeaders();
            headers.set(HttpHeaders.USER_AGENT, "BookLore/1.0 (Book and Comic Metadata Fetcher; +https://github.com/booklore-app/booklore)");
            headers.set(HttpHeaders.ACCEPT, "image/*");

            HttpEntity<String> entity = new HttpEntity<>(headers);

            log.debug("Downloading image from: {}", currentUrl);

            ResponseEntity<byte[]> response = noRedirectRestTemplate.exchange(
                    currentUrl,
                    HttpMethod.GET,
                    entity,
                    byte[].class
            );

            if (response.getStatusCode().is2xxSuccessful() && response.getBody() != null) {
                byte[] body = response.getBody();
                if (body.length > MAX_FILE_SIZE_BYTES) {
                    throw new IOException(String.format(
                            "Downloaded image body (%d bytes) exceeds the %d-byte limit — possible oversized or non-image content",
                            body.length, MAX_FILE_SIZE_BYTES));
                }
                return readImage(body);
            } else if (response.getStatusCode().is3xxRedirection()) {
                String location = response.getHeaders().getFirst(HttpHeaders.LOCATION);
                if (location == null) {
                    throw new IOException("Redirection response without Location header");
                }
                URI redirectUri = uri.resolve(location);

                // When a CDN redirects to a raw IP (e.g. CloudFront -> 3.168.64.124),
                // the Host header would become the bare IP, which the CDN rejects with
                // 400. Rewrite the URL to keep the previous hostname so the JDK
                // HttpClient sets the correct Host header automatically.
                if (isRawIpAddress(redirectUri.getHost())) {
                    try {
                        redirectUri = new URI(
                                redirectUri.getScheme(),
                                redirectUri.getUserInfo(),
                                host,
                                redirectUri.getPort(),
                                redirectUri.getPath(),
                                redirectUri.getQuery(),
                                redirectUri.getFragment()
                        );
                    } catch (URISyntaxException e) {
                        throw new IOException("Invalid redirect URI: " + e.getMessage(), e);
                    }
                }

                currentUrl = redirectUri.toString();
                redirectCount++;
            } else {
                throw new IOException("Failed to download image. HTTP Status: " + response.getStatusCode());
            }
        }

        throw new IOException("Too many redirects (max " + MAX_REDIRECTS + ")");
    }

    private boolean isRawIpAddress(String host) {
        if (host == null) {
            return false;
        }
        // IPv6 in URI brackets
        if (host.startsWith("[")) {
            return true;
        }
        // IPv4: all segments are digits
        String[] parts = host.split("\\.");
        if (parts.length == 4) {
            for (String part : parts) {
                if (!part.chars().allMatch(Character::isDigit)) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }

    private boolean isInternalAddress(InetAddress address) {
        if (address.isLoopbackAddress() || address.isLinkLocalAddress() ||
            address.isSiteLocalAddress() || address.isAnyLocalAddress()) {
            return true;
        }

        byte[] addr = address.getAddress();
        // Check for IPv6 Unique Local Address (fc00::/7)
        if (addr.length == 16) {
            if ((addr[0] & 0xFE) == (byte) 0xFC) {
                return true;
            }
        }

        // Handle IPv4-mapped IPv6 addresses (::ffff:127.0.0.1)
        if (isIpv4MappedAddress(addr)) {
            try {
                byte[] ipv4Bytes = new byte[4];
                System.arraycopy(addr, 12, ipv4Bytes, 0, 4);
                InetAddress ipv4Addr = InetAddress.getByAddress(ipv4Bytes);
                return isInternalAddress(ipv4Addr);
            } catch (java.net.UnknownHostException e) {
                return false;
            }
        }

        return false;
    }

    private boolean isIpv4MappedAddress(byte[] addr) {
        if (addr.length != 16) return false;
        for (int i = 0; i < 10; i++) {
            if (addr[i] != 0) return false;
        }
        return (addr[10] == (byte) 0xFF) && (addr[11] == (byte) 0xFF);
    }

    // ========================================
    // COVER OPERATIONS
    // ========================================

    public void createThumbnailFromFile(long bookId, MultipartFile file) {
        try {
            validateCoverFile(file);
            BufferedImage originalImage;
            try (InputStream inputStream = file.getInputStream()) {
                originalImage = readImage(inputStream);
            }
            if (originalImage == null) {
                log.warn("Could not decode image from file, skipping thumbnail creation for book: {}", bookId);
                return;
            }
            try {
                boolean success = saveCoverImages(originalImage, bookId);
                if (!success) {
                    throw ApiError.FILE_READ_ERROR.createException("Failed to save cover images");
                }
                log.info("Cover images created and saved for book ID: {}", bookId);
            } finally {
                originalImage.flush();
            }
        } catch (Exception e) {
            log.error("An error occurred while creating the thumbnail: {}", e.getMessage(), e);
            throw ApiError.FILE_READ_ERROR.createException(e.getMessage());
        }
    }

    public void createThumbnailFromBytes(long bookId, byte[] imageBytes) {
        try {
            BufferedImage originalImage = readImage(imageBytes);
            if (originalImage == null) {
                log.warn("Skipping thumbnail creation for book {}: image decode failed", bookId);
                return;
            }
            try {
                boolean success = saveCoverImages(originalImage, bookId);
                if (!success) {
                    throw ApiError.FILE_READ_ERROR.createException("Failed to save cover images");
                }
                log.info("Cover images created and saved from bytes for book ID: {}", bookId);
            } finally {
                originalImage.flush();
            }
        } catch (Exception e) {
            log.error("An error occurred while creating thumbnail from bytes: {}", e.getMessage(), e);
            throw ApiError.FILE_READ_ERROR.createException(e.getMessage());
        }
    }

    public void createThumbnailFromUrl(long bookId, String imageUrl) {
        try {
            BufferedImage originalImage = downloadImageFromUrl(imageUrl);
            if (originalImage == null) {
                log.warn("Skipping thumbnail creation for book {}: download/decode failed", bookId);
                return;
            }
            try {
                boolean success = saveCoverImages(originalImage, bookId);
                if (!success) {
                    throw ApiError.FILE_READ_ERROR.createException("Failed to save cover images");
                }
                log.info("Cover images created and saved from URL for book ID: {}", bookId);
            } finally {
                originalImage.flush();
            }
        } catch (Exception e) {
            log.error("An error occurred while creating thumbnail from URL: {}", e.getMessage(), e);
            throw ApiError.FILE_READ_ERROR.createException(e.getMessage());
        }
    }

    // ========================================
    // AUTHOR PHOTO OPERATIONS
    // ========================================

    public void createAuthorThumbnailFromUrl(long authorId, String imageUrl) {
        try {
            BufferedImage originalImage = downloadImageFromUrl(imageUrl);
            if (originalImage == null) {
                log.warn("Skipping author thumbnail creation for author {}: download/decode failed", authorId);
                return;
            }
            try {
                boolean success = saveAuthorImages(originalImage, authorId);
                if (!success) {
                    log.warn("Failed to save author images for author ID: {}", authorId);
                }
                log.info("Author images created and saved from URL for author ID: {}", authorId);
            } finally {
                originalImage.flush();
            }
        } catch (Exception e) {
            log.warn("Failed to create author thumbnail from URL for author {}: {}", authorId, e.getMessage());
        }
    }

    public boolean saveAuthorImages(BufferedImage sourceImage, long authorId) throws IOException {
        BufferedImage rgbImage = null;
        BufferedImage resized = null;
        BufferedImage thumb = null;
        try {
            String folderPath = getAuthorImagesFolder(authorId);
            File folder = new File(folderPath);
            if (!folder.exists() && !folder.mkdirs()) {
                throw new IOException("Failed to create directory: " + folder.getAbsolutePath());
            }

            rgbImage = new BufferedImage(
                    sourceImage.getWidth(),
                    sourceImage.getHeight(),
                    BufferedImage.TYPE_INT_RGB
            );
            Graphics2D g = rgbImage.createGraphics();
            g.drawImage(sourceImage, 0, 0, Color.WHITE, null);
            g.dispose();

            double scale = Math.min(
                    (double) MAX_ORIGINAL_WIDTH / rgbImage.getWidth(),
                    (double) MAX_ORIGINAL_HEIGHT / rgbImage.getHeight()
            );
            if (scale < 1.0) {
                resized = resizeImage(rgbImage, (int) (rgbImage.getWidth() * scale), (int) (rgbImage.getHeight() * scale));
                rgbImage.flush();
                rgbImage = resized;
            }

            File photoFile = new File(folder, AUTHOR_PHOTO_FILENAME);
            boolean photoSaved = ImageIO.write(rgbImage, IMAGE_FORMAT, photoFile);

            double targetRatio = (double) THUMBNAIL_WIDTH / THUMBNAIL_HEIGHT;
            double sourceRatio = (double) rgbImage.getWidth() / rgbImage.getHeight();
            int cropWidth, cropHeight, cropX, cropY;
            if (sourceRatio > targetRatio) {
                cropHeight = rgbImage.getHeight();
                cropWidth = (int) (cropHeight * targetRatio);
                cropX = (rgbImage.getWidth() - cropWidth) / 2;
                cropY = 0;
            } else {
                cropWidth = rgbImage.getWidth();
                cropHeight = (int) (cropWidth / targetRatio);
                cropX = 0;
                cropY = (rgbImage.getHeight() - cropHeight) / 2;
            }
            BufferedImage cropped = rgbImage.getSubimage(cropX, cropY, cropWidth, cropHeight);
            thumb = resizeImage(cropped, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);

            File thumbnailFile = new File(folder, AUTHOR_THUMBNAIL_FILENAME);
            boolean thumbnailSaved = ImageIO.write(thumb, IMAGE_FORMAT, thumbnailFile);

            return photoSaved && thumbnailSaved;
        } finally {
            if (rgbImage != null) {
                rgbImage.flush();
            }
            if (resized != null && resized != rgbImage) {
                resized.flush();
            }
            if (thumb != null) {
                thumb.flush();
            }
        }
    }

    public void deleteAuthorImages(long authorId) {
        String authorImageFolder = getAuthorImagesFolder(authorId);
        Path folderPath = Paths.get(authorImageFolder);
        try {
            if (Files.exists(folderPath) && Files.isDirectory(folderPath)) {
                try (Stream<Path> walk = Files.walk(folderPath)) {
                    walk.sorted(Comparator.reverseOrder())
                            .forEach(path -> {
                                try {
                                    Files.delete(path);
                                } catch (IOException e) {
                                    log.error("Failed to delete file: {} - {}", path, e.getMessage());
                                }
                            });
                }
            }
        } catch (IOException e) {
            log.error("Error deleting author images for author {}: {}", authorId, e.getMessage());
        }
    }

    // ========================================
    // AUDIOBOOK COVER OPERATIONS
    // ========================================

    public void createAudiobookThumbnailFromFile(long bookId, MultipartFile file) {
        try {
            validateCoverFile(file);
            BufferedImage originalImage;
            try (InputStream inputStream = file.getInputStream()) {
                originalImage = readImage(inputStream);
            }
            if (originalImage == null) {
                log.warn("Could not decode image from file, skipping audiobook thumbnail creation for book: {}", bookId);
                return;
            }
            try {
                boolean success = saveAudiobookCoverImages(originalImage, bookId);
                if (!success) {
                    throw ApiError.FILE_READ_ERROR.createException("Failed to save audiobook cover images");
                }
                log.info("Audiobook cover images created and saved for book ID: {}", bookId);
            } finally {
                originalImage.flush();
            }
        } catch (Exception e) {
            log.error("An error occurred while creating the audiobook thumbnail: {}", e.getMessage(), e);
            throw ApiError.FILE_READ_ERROR.createException(e.getMessage());
        }
    }

    public void createAudiobookThumbnailFromBytes(long bookId, byte[] imageBytes) {
        try {
            BufferedImage originalImage = readImage(imageBytes);
            if (originalImage == null) {
                log.warn("Skipping audiobook thumbnail creation for book {}: image decode failed", bookId);
                return;
            }
            try {
                boolean success = saveAudiobookCoverImages(originalImage, bookId);
                if (!success) {
                    throw ApiError.FILE_READ_ERROR.createException("Failed to save audiobook cover images");
                }
                log.info("Audiobook cover images created and saved from bytes for book ID: {}", bookId);
            } finally {
                originalImage.flush();
            }
        } catch (Exception e) {
            log.error("An error occurred while creating audiobook thumbnail from bytes: {}", e.getMessage(), e);
            throw ApiError.FILE_READ_ERROR.createException(e.getMessage());
        }
    }

    public void createAudiobookThumbnailFromUrl(long bookId, String imageUrl) {
        try {
            BufferedImage originalImage = downloadImageFromUrl(imageUrl);
            if (originalImage == null) {
                log.warn("Skipping audiobook thumbnail creation for book {}: download/decode failed", bookId);
                return;
            }
            try {
                boolean success = saveAudiobookCoverImages(originalImage, bookId);
                if (!success) {
                    throw ApiError.FILE_READ_ERROR.createException("Failed to save audiobook cover images");
                }
                log.info("Audiobook cover images created and saved from URL for book ID: {}", bookId);
            } finally {
                originalImage.flush();
            }
        } catch (Exception e) {
            log.error("An error occurred while creating audiobook thumbnail from URL: {}", e.getMessage(), e);
            throw ApiError.FILE_READ_ERROR.createException(e.getMessage());
        }
    }

    public boolean saveAudiobookCoverImages(BufferedImage coverImage, long bookId) throws IOException {
        BufferedImage rgbImage = null;
        BufferedImage resized = null;
        BufferedImage thumb = null;
        try {
            String folderPath = getImagesFolder(bookId);
            File folder = new File(folderPath);
            if (!folder.exists() && !folder.mkdirs()) {
                throw new IOException("Failed to create directory: " + folder.getAbsolutePath());
            }

            rgbImage = new BufferedImage(
                    coverImage.getWidth(),
                    coverImage.getHeight(),
                    BufferedImage.TYPE_INT_RGB
            );
            Graphics2D g = rgbImage.createGraphics();
            g.drawImage(coverImage, 0, 0, Color.WHITE, null);
            g.dispose();

            // Resize to square if needed, maintaining 1:1 aspect ratio
            int size = Math.min(rgbImage.getWidth(), rgbImage.getHeight());
            int x = (rgbImage.getWidth() - size) / 2;
            int y = (rgbImage.getHeight() - size) / 2;
            BufferedImage cropped = rgbImage.getSubimage(x, y, size, size);

            // Resize if too large
            if (size > MAX_SQUARE_SIZE) {
                resized = resizeImage(cropped, MAX_SQUARE_SIZE, MAX_SQUARE_SIZE);
            } else {
                resized = cropped;
            }

            File originalFile = new File(folder, AUDIOBOOK_COVER_FILENAME);
            boolean originalSaved = ImageIO.write(resized, IMAGE_FORMAT, originalFile);

            // Create square thumbnail
            thumb = resizeImage(resized, SQUARE_THUMBNAIL_SIZE, SQUARE_THUMBNAIL_SIZE);
            File thumbnailFile = new File(folder, AUDIOBOOK_THUMBNAIL_FILENAME);
            boolean thumbnailSaved = ImageIO.write(thumb, IMAGE_FORMAT, thumbnailFile);
            saveThumbnailWebpIfPossible(thumb, new File(folder, AUDIOBOOK_THUMBNAIL_WEBP_FILENAME), "audiobook", bookId);

            return originalSaved && thumbnailSaved;
        } finally {
            if (rgbImage != null) {
                rgbImage.flush();
            }
            if (resized != null && resized != rgbImage) {
                resized.flush();
            }
            if (thumb != null) {
                thumb.flush();
            }
        }
    }

    public boolean saveCoverImages(BufferedImage coverImage, long bookId) throws IOException {
        BufferedImage rgbImage = null;
        BufferedImage cropped = null;
        BufferedImage resized = null;
        BufferedImage thumb = null;
        try {
            String folderPath = getImagesFolder(bookId);
            File folder = new File(folderPath);
            if (!folder.exists() && !folder.mkdirs()) {
                throw new IOException("Failed to create directory: " + folder.getAbsolutePath());
            }

            rgbImage = new BufferedImage(
                    coverImage.getWidth(),
                    coverImage.getHeight(),
                    BufferedImage.TYPE_INT_RGB
            );
            Graphics2D g = rgbImage.createGraphics();
            g.drawImage(coverImage, 0, 0, Color.WHITE, null);
            g.dispose();
            // Note: coverImage is not flushed here - caller is responsible for its lifecycle

            cropped = applyCoverCropping(rgbImage);
            if (cropped != rgbImage) {
                rgbImage.flush();
                rgbImage = cropped;
            }

            // Resize original image if too large to prevent OOM
            double scale = Math.min(
                    (double) MAX_ORIGINAL_WIDTH / rgbImage.getWidth(),
                    (double) MAX_ORIGINAL_HEIGHT / rgbImage.getHeight()
            );
            if (scale < 1.0) {
                resized = resizeImage(rgbImage, (int) (rgbImage.getWidth() * scale), (int) (rgbImage.getHeight() * scale));
                rgbImage.flush(); // Release resources of the original large image
                rgbImage = resized;
            }

            File originalFile = new File(folder, COVER_FILENAME);
            boolean originalSaved = ImageIO.write(rgbImage, IMAGE_FORMAT, originalFile);

            // Determine thumbnail dimensions based on source aspect ratio
            int thumbWidth, thumbHeight;
            double aspectRatio = (double) rgbImage.getWidth() / rgbImage.getHeight();
            if (aspectRatio >= 0.85 && aspectRatio <= 1.15) {
                // Square-ish image (e.g., audiobook covers) - keep square
                thumbWidth = THUMBNAIL_WIDTH;
                thumbHeight = THUMBNAIL_WIDTH;
            } else {
                // Portrait/landscape - use standard dimensions
                thumbWidth = THUMBNAIL_WIDTH;
                thumbHeight = THUMBNAIL_HEIGHT;
            }
            thumb = resizeImage(rgbImage, thumbWidth, thumbHeight);
            File thumbnailFile = new File(folder, THUMBNAIL_FILENAME);
            boolean thumbnailSaved = ImageIO.write(thumb, IMAGE_FORMAT, thumbnailFile);
            saveThumbnailWebpIfPossible(thumb, new File(folder, THUMBNAIL_WEBP_FILENAME), "book", bookId);

            return originalSaved && thumbnailSaved;
        } finally {
            // Cleanup resources created within this method
            // Note: cropped/resized may equal rgbImage after reassignment, avoid double-flush
            if (rgbImage != null) {
                rgbImage.flush();
            }
            if (cropped != null && cropped != rgbImage) {
                cropped.flush();
            }
            if (resized != null && resized != rgbImage) {
                resized.flush();
            }
            if (thumb != null) {
                thumb.flush();
            }
        }
    }

    public Path ensureBookThumbnailWebp(long bookId) {
        return ensureWebpThumbnail(Paths.get(getThumbnailFile(bookId)), Paths.get(getThumbnailWebpFile(bookId)), "book", bookId);
    }

    public Path ensureAudiobookThumbnailWebp(long bookId) {
        return ensureWebpThumbnail(Paths.get(getAudiobookThumbnailFile(bookId)), Paths.get(getAudiobookThumbnailWebpFile(bookId)), "audiobook", bookId);
    }

    private Path ensureWebpThumbnail(Path jpegPath, Path webpPath, String imageType, long entityId) {
        if (Files.exists(webpPath)) {
            return webpPath;
        }
        if (!Files.exists(jpegPath)) {
            return null;
        }

        BufferedImage image = null;
        try (InputStream inputStream = Files.newInputStream(jpegPath)) {
            image = readImage(inputStream);
            if (image == null) {
                return null;
            }
            if (!writeImageFile(image, WEBP_IMAGE_FORMAT, webpPath.toFile())) {
                log.warn("WEBP writer unavailable while backfilling {} thumbnail for {} {}", imageType, imageType, entityId);
                return null;
            }
            return webpPath;
        } catch (IOException e) {
            log.warn("Failed to backfill WEBP {} thumbnail for {}: {}", imageType, entityId, e.getMessage());
            return null;
        } finally {
            if (image != null) {
                image.flush();
            }
        }
    }

    private void saveThumbnailWebpIfPossible(BufferedImage thumbnail, File outputFile, String imageType, long entityId) throws IOException {
        if (thumbnail == null) {
            return;
        }
        if (!writeImageFile(thumbnail, WEBP_IMAGE_FORMAT, outputFile)) {
            log.debug("WEBP writer unavailable for {} thumbnail {}", imageType, entityId);
        }
    }

    private boolean writeImageFile(BufferedImage image, String format, File outputFile) throws IOException {
        File parentDir = outputFile.getParentFile();
        if (parentDir != null && !parentDir.exists() && !parentDir.mkdirs()) {
            throw new IOException("Failed to create directory: " + parentDir);
        }
        return ImageIO.write(image, format, outputFile);
    }

    private BufferedImage applyCoverCropping(BufferedImage image) {
        CoverCroppingSettings settings = appSettingService.getAppSettings().getCoverCroppingSettings();
        if (settings == null) {
            return image;
        }

        int width = image.getWidth();
        int height = image.getHeight();
        double heightToWidthRatio = (double) height / width;
        double widthToHeightRatio = (double) width / height;
        double threshold = settings.getAspectRatioThreshold();
        boolean smartCrop = settings.isSmartCroppingEnabled();

        boolean isExtremelyTall = settings.isVerticalCroppingEnabled() && heightToWidthRatio > threshold;
        if (isExtremelyTall) {
            int croppedHeight = (int) (width * TARGET_COVER_ASPECT_RATIO);
            log.debug("Cropping tall image: {}x{} (ratio {}) -> {}x{}, smartCrop={}",
                    width, height, String.format("%.2f", heightToWidthRatio), width, croppedHeight, smartCrop);
            return cropFromTop(image, width, croppedHeight, smartCrop);
        }

        boolean isExtremelyWide = settings.isHorizontalCroppingEnabled() && widthToHeightRatio > threshold;
        if (isExtremelyWide) {
            int croppedWidth = (int) (height / TARGET_COVER_ASPECT_RATIO);
            log.debug("Cropping wide image: {}x{} (ratio {}) -> {}x{}, smartCrop={}",
                    width, height, String.format("%.2f", widthToHeightRatio), croppedWidth, height, smartCrop);
            return cropFromLeft(image, croppedWidth, height, smartCrop);
        }

        return image;
    }

    private BufferedImage cropFromTop(BufferedImage image, int targetWidth, int targetHeight, boolean smartCrop) {
        int startY = 0;
        if (smartCrop) {
            int contentStartY = findContentStartY(image);
            int margin = (int) (targetHeight * SMART_CROP_MARGIN_PERCENT);
            startY = Math.max(0, contentStartY - margin);

            int maxStartY = image.getHeight() - targetHeight;
            startY = Math.min(startY, maxStartY);
        }
        return image.getSubimage(0, startY, targetWidth, targetHeight);
    }

    private BufferedImage cropFromLeft(BufferedImage image, int targetWidth, int targetHeight, boolean smartCrop) {
        int startX = 0;
        if (smartCrop) {
            int contentStartX = findContentStartX(image);
            int margin = (int) (targetWidth * SMART_CROP_MARGIN_PERCENT);
            startX = Math.max(0, contentStartX - margin);

            int maxStartX = image.getWidth() - targetWidth;
            startX = Math.min(startX, maxStartX);
        }
        return image.getSubimage(startX, 0, targetWidth, targetHeight);
    }

    private int findContentStartY(BufferedImage image) {
        for (int y = 0; y < image.getHeight(); y++) {
            if (!isRowUniformColor(image, y)) {
                return y;
            }
        }
        return 0;
    }

    private int findContentStartX(BufferedImage image) {
        for (int x = 0; x < image.getWidth(); x++) {
            if (!isColumnUniformColor(image, x)) {
                return x;
            }
        }
        return 0;
    }

    private boolean isRowUniformColor(BufferedImage image, int y) {
        int firstPixel = image.getRGB(0, y);
        for (int x = 1; x < image.getWidth(); x++) {
            if (!colorsAreSimilar(firstPixel, image.getRGB(x, y))) {
                return false;
            }
        }
        return true;
    }

    private boolean isColumnUniformColor(BufferedImage image, int x) {
        int firstPixel = image.getRGB(x, 0);
        for (int y = 1; y < image.getHeight(); y++) {
            if (!colorsAreSimilar(firstPixel, image.getRGB(x, y))) {
                return false;
            }
        }
        return true;
    }

    private boolean colorsAreSimilar(int rgb1, int rgb2) {
        int r1 = (rgb1 >> 16) & 0xFF, g1 = (rgb1 >> 8) & 0xFF, b1 = rgb1 & 0xFF;
        int r2 = (rgb2 >> 16) & 0xFF, g2 = (rgb2 >> 8) & 0xFF, b2 = rgb2 & 0xFF;
        return Math.abs(r1 - r2) <= SMART_CROP_COLOR_TOLERANCE
                && Math.abs(g1 - g2) <= SMART_CROP_COLOR_TOLERANCE
                && Math.abs(b1 - b2) <= SMART_CROP_COLOR_TOLERANCE;
    }

    public static void setBookCoverPath(BookMetadataEntity bookMetadataEntity) {
        bookMetadataEntity.setCoverUpdatedOn(Instant.now());
    }

    public void deleteBookCovers(Set<Long> bookIds) {
        for (Long bookId : bookIds) {
            String bookCoverFolder = getImagesFolder(bookId);
            Path folderPath = Paths.get(bookCoverFolder);
            try {
                if (Files.exists(folderPath) && Files.isDirectory(folderPath)) {
                    try (Stream<Path> walk = Files.walk(folderPath)) {
                        walk.sorted(Comparator.reverseOrder())
                                .forEach(path -> {
                                    try {
                                        Files.delete(path);
                                    } catch (IOException e) {
                                        log.error("Failed to delete file: {} - {}", path, e.getMessage());
                                    }
                                });
                    }
                }
            } catch (IOException e) {
                log.error("Error processing folder: {} - {}", folderPath, e.getMessage());
            }
        }
        log.info("Deleted {} book covers", bookIds.size());
    }

    public String getIconsSvgFolder() {
        return Paths.get(appProperties.getPathConfig(), ICONS_DIR, SVG_DIR).toString();
    }

    // ========================================
    // UTILITY METHODS
    // ========================================

    public static String truncate(String input, int maxLength) {
        if (input == null) return null;
        if (maxLength <= 0) return "";
        return input.length() <= maxLength ? input : input.substring(0, maxLength);
    }

    public void clearCacheDirectory(String cachePath) {
        Path path = Paths.get(cachePath);
        if (Files.exists(path) && Files.isDirectory(path)) {
            try (Stream<Path> walk = Files.walk(path)) {
                walk.sorted(Comparator.reverseOrder())
                        .forEach(p -> {
                            try {
                                Files.delete(p);
                            } catch (IOException e) {
                                log.error("Failed to delete file in cache: {} - {}", p, e.getMessage());
                            }
                        });
                // Recreate the directory after deletion
                Files.createDirectories(path);
            } catch (IOException e) {
                log.error("Failed to clear cache directory: {} - {}", cachePath, e.getMessage());
            }
        }
    }
}
