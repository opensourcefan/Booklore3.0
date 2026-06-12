package org.fable.service.koreader;

import org.fable.config.security.userdetails.KoreaderUserDetails;
import org.fable.exception.ApiError;
import org.fable.model.dto.progress.KoreaderProgress;
import org.fable.model.entity.*;
import org.fable.model.enums.ReadStatus;
import org.fable.repository.BookRepository;
import org.fable.repository.KoreaderUserRepository;
import org.fable.repository.UserBookFileProgressRepository;
import org.fable.repository.UserBookProgressRepository;
import org.fable.repository.UserRepository;
import org.fable.service.hardcover.HardcoverSyncService;
import org.fable.util.Md5Util;
import org.fable.util.koreader.EpubCfiService;
import lombok.AllArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.Map;

@Slf4j
@AllArgsConstructor
@Service
public class KoreaderService {

    private final UserBookProgressRepository progressRepository;
    private final UserBookFileProgressRepository fileProgressRepository;
    private final BookRepository bookRepository;
    private final UserRepository userRepository;
    private final KoreaderUserRepository koreaderUserRepository;
    private final HardcoverSyncService hardcoverSyncService;
    private final EpubCfiService epubCfiService;

    public ResponseEntity<Map<String, String>> authorizeUser() {
        KoreaderUserDetails authDetails = getAuthDetails();
        KoreaderUserEntity koreaderUser = findKoreaderUser(authDetails.getUsername());
        validatePassword(koreaderUser, authDetails);

        log.info("User '{}' authorized", authDetails.getUsername());
        return ResponseEntity.ok(Map.of("username", authDetails.getUsername()));
    }

    public KoreaderProgress getProgress(String bookHash) {
        KoreaderUserDetails authDetails = getAuthDetailsWithSyncCheck();
        BookEntity book = findBookByHash(bookHash);
        UserBookProgressEntity progress = findUserProgress(authDetails.getFableUserId(), book.getId());

        log.info("getProgress: fetched progress='{}' percentage={} for userId={} bookHash={}",
                progress.getKoreaderProgress(), progress.getKoreaderProgressPercent(),
                authDetails.getFableUserId(), bookHash);

        Long timestamp = progress.getKoreaderLastSyncTime() != null
                ? progress.getKoreaderLastSyncTime().getEpochSecond()
                : null;

        return KoreaderProgress.builder()
                .timestamp(timestamp)
                .document(bookHash)
                .progress(progress.getKoreaderProgress())
                .percentage(progress.getKoreaderProgressPercent())
                .device("Fable")
                .device_id("Fable")
                .build();
    }

    public void saveProgress(String bookHash, KoreaderProgress koProgress) {
        KoreaderUserDetails authDetails = getAuthDetailsWithSyncCheck();
        BookEntity book = findBookByHash(bookHash);
        FableUserEntity user = findFableUser(authDetails.getFableUserId());

        UserBookProgressEntity userProgress = getOrCreateUserProgress(user, book);
        Float previousProgressPercent = userProgress.getKoreaderProgressPercent();
        ReadStatus previousReadStatus = userProgress.getReadStatus();
        updateProgressData(userProgress, koProgress, authDetails.isSyncWithFableReader(), book);

        progressRepository.save(userProgress);

        // Also save to file-level progress table (dual-write)
        saveToFileProgress(user, book, userProgress);

        log.info("saveProgress: saved progress='{}' percentage={} for userId={} bookHash={}", koProgress.getProgress(), koProgress.getPercentage(), authDetails.getFableUserId(), bookHash);

        // Sync progress to Hardcover asynchronously (if enabled for this user)
        // But only if the progress percentage has changed from last time, or the read status has changed
        if (koProgress.getPercentage() != null && (!koProgress.getPercentage().equals(previousProgressPercent)
                || userProgress.getReadStatus() != previousReadStatus)) {
            Float progressPercent = normalizeProgressPercent(koProgress.getPercentage());
            hardcoverSyncService.syncProgressToHardcover(book.getId(), progressPercent, authDetails.getFableUserId());
        }
    }

    private void saveToFileProgress(FableUserEntity user, BookEntity book, UserBookProgressEntity progress) {
        try {
            BookFileEntity primaryFile = book.getPrimaryBookFile();
            UserBookFileProgressEntity fileProgress = fileProgressRepository
                    .findByUserIdAndBookFileId(user.getId(), primaryFile.getId())
                    .orElseGet(UserBookFileProgressEntity::new);

            fileProgress.setUser(user);
            fileProgress.setBookFile(primaryFile);
            fileProgress.setLastReadTime(progress.getLastReadTime());

            // Map progress based on book type
            switch (primaryFile.getBookType()) {
                case EPUB, FB2, MOBI, AZW3 -> {
                    fileProgress.setPositionData(progress.getEpubProgress());
                    fileProgress.setPositionHref(progress.getEpubProgressHref());
                    fileProgress.setProgressPercent(progress.getEpubProgressPercent());
                }
                case PDF -> {
                    fileProgress.setPositionData(progress.getPdfProgress() != null ?
                            String.valueOf(progress.getPdfProgress()) : null);
                    fileProgress.setProgressPercent(progress.getPdfProgressPercent());
                }
                case CBX -> {
                    fileProgress.setPositionData(progress.getCbxProgress() != null ?
                            String.valueOf(progress.getCbxProgress()) : null);
                    fileProgress.setProgressPercent(progress.getCbxProgressPercent());
                }
                case AUDIOBOOK -> {
                    // KOReader does not sync audiobook position data.
                }
            }

            fileProgressRepository.save(fileProgress);
        } catch (Exception e) {
            log.warn("Failed to save file-level progress for book {}: {}", book.getId(), e.getMessage());
        }
    }

    private void updateProgressData(UserBookProgressEntity userProgress, KoreaderProgress koProgress, boolean syncWithFableReader, BookEntity book) {
        userProgress.setKoreaderProgress(koProgress.getProgress());
        userProgress.setKoreaderProgressPercent(koProgress.getPercentage());
        userProgress.setKoreaderDevice(koProgress.getDevice());
        userProgress.setKoreaderDeviceId(koProgress.getDevice_id());
        userProgress.setKoreaderLastSyncTime(Instant.now());
        userProgress.setLastReadTime(Instant.now());
        if (syncWithFableReader && koProgress.getProgress() != null) {
            try {
                String cfi = epubCfiService.convertXPointerToCfi(book.getFullFilePath(), koProgress.getProgress());

                float percent = koProgress.getPercentage() * 100f;
                float rounded = BigDecimal
                        .valueOf(percent)
                        .setScale(1, RoundingMode.HALF_UP)
                        .floatValue();

                userProgress.setEpubProgress(cfi);
                userProgress.setEpubProgressPercent(rounded);

                log.info("Converted xpointer to CFI for Fable reader sync: {}", cfi);
            } catch (Exception e) {
                log.warn("Failed to convert xpointer to CFI: {}", e.getMessage());
            }
        }

        updateReadStatus(userProgress, koProgress.getPercentage());
    }

    private void updateReadStatus(UserBookProgressEntity userProgress, double progressFraction) {
        double progressPercent = progressFraction * 100.0;
        if (progressPercent >= 99.5) {
            userProgress.setReadStatus(ReadStatus.READ);
            userProgress.setDateFinished(Instant.now());
        } else if (progressPercent >= 0.25) {
            userProgress.setReadStatus(ReadStatus.READING);
        } else {
            userProgress.setReadStatus(ReadStatus.UNREAD);
        }
    }

    private Float normalizeProgressPercent(Float progress) {
        if (progress == null) {
            return null;
        }
        if (progress <= 1.0f) {
            return progress * 100.0f;
        }
        return progress;
    }

    private KoreaderUserDetails getAuthDetails() {
        Object principal = SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        if (!(principal instanceof KoreaderUserDetails details)) {
            log.warn("Authentication failed: invalid principal type");
            throw ApiError.GENERIC_UNAUTHORIZED.createException("User not authenticated");
        }
        return details;
    }

    private KoreaderUserDetails getAuthDetailsWithSyncCheck() {
        KoreaderUserDetails authDetails = getAuthDetails();
        ensureSyncEnabled(authDetails);
        return authDetails;
    }

    private KoreaderUserEntity findKoreaderUser(String username) {
        return koreaderUserRepository.findByUsername(username)
                .orElseThrow(() -> {
                    log.warn("KOReader user '{}' not found", username);
                    return ApiError.GENERIC_NOT_FOUND.createException("KOReader user not found");
                });
    }

    private void validatePassword(KoreaderUserEntity koreaderUser, KoreaderUserDetails authDetails) {
        if (koreaderUser.getPasswordMD5() == null ||
                !Md5Util.constantTimeEqualsHex(koreaderUser.getPasswordMD5(), authDetails.getPassword())) {
            log.warn("Password mismatch for user '{}'", authDetails.getUsername());
            throw ApiError.GENERIC_UNAUTHORIZED.createException("Invalid credentials");
        }
    }

    private BookEntity findBookByHash(String bookHash) {
        return bookRepository.findByCurrentHash(bookHash)
                .orElseThrow(() -> ApiError.GENERIC_NOT_FOUND.createException("Book not found for hash " + bookHash));
    }

    private FableUserEntity findFableUser(long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> ApiError.GENERIC_NOT_FOUND.createException("User not found with id " + userId));
    }

    private UserBookProgressEntity findUserProgress(long userId, Long bookId) {
        return progressRepository.findByUserIdAndBookId(userId, bookId)
                .orElseThrow(() -> ApiError.GENERIC_NOT_FOUND.createException("No progress found for user and book"));
    }

    private UserBookProgressEntity getOrCreateUserProgress(FableUserEntity user, BookEntity book) {
        return progressRepository.findByUserIdAndBookId(user.getId(), book.getId())
                .orElseGet(() -> {
                    UserBookProgressEntity newProgress = new UserBookProgressEntity();
                    newProgress.setUser(user);
                    newProgress.setBook(book);
                    return newProgress;
                });
    }

    private void ensureSyncEnabled(KoreaderUserDetails details) {
        if (!details.isSyncEnabled()) {
            log.warn("Sync is disabled for user '{}'", details.getUsername());
            throw ApiError.GENERIC_UNAUTHORIZED.createException("Sync is disabled for this user");
        }
    }
}
