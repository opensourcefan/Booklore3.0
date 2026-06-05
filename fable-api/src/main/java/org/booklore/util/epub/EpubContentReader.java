package org.booklore.util.epub;

import io.documentnode.epub4j.domain.Book;
import io.documentnode.epub4j.domain.MediaType;
import io.documentnode.epub4j.domain.MediaTypes;
import io.documentnode.epub4j.domain.Resource;
import io.documentnode.epub4j.domain.Spine;
import io.documentnode.epub4j.domain.TOCReference;
import io.documentnode.epub4j.domain.TableOfContents;
import io.documentnode.epub4j.epub.EpubReader;
import lombok.extern.slf4j.Slf4j;
import net.lingala.zip4j.ZipFile;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
public class EpubContentReader {

    private static final List<MediaType> MEDIA_TYPES = new ArrayList<>();
    static {
        MEDIA_TYPES.addAll(Arrays.asList(MediaTypes.mediaTypes));
        MEDIA_TYPES.add(null);
    }

    private EpubContentReader() {
    }

    public static String getSpineItemContent(File epubFile, int spineIndex) {
        try (ZipFile zip = new ZipFile(epubFile)) {
            Book epub = new EpubReader().readEpubLazy(zip, "UTF-8", MEDIA_TYPES);

            Spine spine = epub.getSpine();
            if (spine == null || spine.size() == 0) {
                throw new EpubReadException("EPUB has no spine: " + epubFile.getName());
            }

            if (spineIndex < 0 || spineIndex >= spine.size()) {
                throw new EpubReadException(
                        String.format("Spine index %d out of bounds (0-%d) for: %s",
                                spineIndex, spine.size() - 1, epubFile.getName()));
            }

            Resource resource = spine.getResource(spineIndex);
            if (resource == null) {
                throw new EpubReadException(
                        String.format("Spine item %d has no resource in: %s", spineIndex, epubFile.getName()));
            }

            return new String(resource.getData(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new EpubReadException("Failed to read EPUB file: " + epubFile.getName(), e);
        }
    }

    public static String getSpineItemContent(Path epubPath, int spineIndex) {
        return getSpineItemContent(epubPath.toFile(), spineIndex);
    }

    public static int getSpineSize(File epubFile) {
        try (ZipFile zip = new ZipFile(epubFile)) {
            Book epub = new EpubReader().readEpubLazy(zip, "UTF-8", MEDIA_TYPES);
            Spine spine = epub.getSpine();
            return spine != null ? spine.size() : 0;
        } catch (IOException e) {
            throw new EpubReadException("Failed to read EPUB file: " + epubFile.getName(), e);
        }
    }

    public static String getSpineItemHref(File epubFile, int spineIndex) {
        try (ZipFile zip = new ZipFile(epubFile)) {
            Book epub = new EpubReader().readEpubLazy(zip, "UTF-8", MEDIA_TYPES);

            Spine spine = epub.getSpine();
            if (spine == null || spineIndex < 0 || spineIndex >= spine.size()) {
                return null;
            }

            Resource resource = spine.getResource(spineIndex);
            return resource != null ? resource.getHref() : null;
        } catch (IOException e) {
            log.warn("Failed to get spine item href from EPUB: {}", epubFile.getName(), e);
            return null;
        }
    }

    public static List<String> getAllSpineItemHrefs(File epubFile) {
        List<String> hrefs = new ArrayList<>();
        try (ZipFile zip = new ZipFile(epubFile)) {
            Book epub = new EpubReader().readEpubLazy(zip, "UTF-8", MEDIA_TYPES);

            Spine spine = epub.getSpine();
            if (spine != null) {
                for (int i = 0; i < spine.size(); i++) {
                    Resource resource = spine.getResource(i);
                    hrefs.add(resource != null ? resource.getHref() : null);
                }
            }
        } catch (IOException e) {
            log.warn("Failed to get spine items from EPUB: {}", epubFile.getName(), e);
        }
        return hrefs;
    }

    /**
     * Builds a map from spine resource href to TOC title by parsing the EPUB's
     * table of contents. This provides chapter/section names for every spine item
     * that appears in the TOC, which can be used as fallback when HTML headings
     * are not found.
     *
     * @return Map of href (as stored in spine) → TOC title, or empty map if no TOC exists
     */
    public static Map<String, String> getTocTitleMap(File epubFile) {
        Map<String, String> result = new LinkedHashMap<>();
        try (ZipFile zip = new ZipFile(epubFile)) {
            Book epub = new EpubReader().readEpubLazy(zip, "UTF-8", MEDIA_TYPES);
            TableOfContents toc = epub.getTableOfContents();
            if (toc != null) {
                collectTocTitles(toc.getTocReferences(), result);
            }
        } catch (IOException e) {
            log.warn("Failed to read TOC from EPUB: {}", epubFile.getName(), e);
        }
        return result;
    }

    private static void collectTocTitles(List<TOCReference> references, Map<String, String> result) {
        if (references == null) return;
        for (TOCReference ref : references) {
            String title = ref.getTitle();
            if (title != null && !title.isBlank()) {
                Resource resource = ref.getResource();
                if (resource != null) {
                    String href = resource.getHref();
                    if (href != null) {
                        // Normalize: strip fragment and leading slashes for matching
                        String normalized = href.replaceFirst("#.*$", "");
                        if (normalized.startsWith("/")) {
                            normalized = normalized.substring(1);
                        }
                        result.putIfAbsent(normalized, title.trim());
                    }
                }
            }
            // Recurse into children
            collectTocTitles(ref.getChildren(), result);
        }
    }

    public static class EpubReadException extends RuntimeException {
        public EpubReadException(String message) {
            super(message);
        }

        public EpubReadException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
