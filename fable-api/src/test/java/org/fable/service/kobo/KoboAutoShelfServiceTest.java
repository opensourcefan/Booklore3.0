package org.fable.service.kobo;

import org.fable.model.entity.BookEntity;
import org.fable.model.entity.FableUserEntity;
import org.fable.model.entity.KoboUserSettingsEntity;
import org.fable.model.entity.ShelfEntity;
import org.fable.model.enums.ShelfType;
import org.fable.repository.BookRepository;
import org.fable.repository.KoboUserSettingsRepository;
import org.fable.repository.ShelfRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.*;

import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class KoboAutoShelfServiceTest {

    @Mock
    private KoboUserSettingsRepository koboUserSettingsRepository;

    @Mock
    private ShelfRepository shelfRepository;

    @Mock
    private BookRepository bookRepository;

    @Mock
    private KoboCompatibilityService koboCompatibilityService;

    @InjectMocks
    private KoboAutoShelfService koboAutoShelfService;

    private BookEntity testBook;
    private FableUserEntity testUser1;
    private FableUserEntity testUser2;
    private ShelfEntity koboShelf1;
    private ShelfEntity koboShelf2;
    private KoboUserSettingsEntity settings1;
    private KoboUserSettingsEntity settings2;

    @BeforeEach
    void setUp() {
        testBook = BookEntity.builder()
                .id(1L)
                .shelves(new HashSet<>())
                .build();

        testUser1 = FableUserEntity.builder()
                .id(100L)
                .isDefaultPassword(false).build();

        testUser2 = FableUserEntity.builder()
                .id(200L)
                .isDefaultPassword(false).build();

        koboShelf1 = ShelfEntity.builder()
                .id(10L)
                .name(ShelfType.KOBO.getName())
                .user(testUser1)
                .build();

        koboShelf2 = ShelfEntity.builder()
                .id(20L)
                .name(ShelfType.KOBO.getName())
                .user(testUser2)
                .build();

        settings1 = KoboUserSettingsEntity.builder()
                .userId(100L)
                .autoAddToShelf(true)
                .syncEnabled(true)
                .build();

        settings2 = KoboUserSettingsEntity.builder()
                .userId(200L)
                .autoAddToShelf(true)
                .syncEnabled(true)
                .build();
    }

    @Test
    void autoAddBookToKoboShelves_withNullBookId_shouldReturnEarly() {
        koboAutoShelfService.autoAddBookToKoboShelves(null);

        verify(bookRepository, never()).findById(anyLong());
        verify(koboUserSettingsRepository, never()).findByAutoAddToShelfTrueAndSyncEnabledTrue();
        verify(shelfRepository, never()).findByUserIdInAndName(anyList(), anyString());
        verify(bookRepository, never()).save(any());
    }

    @Test
    void autoAddBookToKoboShelves_withNonExistentBook_shouldReturnEarly() {
        when(bookRepository.findById(1L)).thenReturn(Optional.empty());

        koboAutoShelfService.autoAddBookToKoboShelves(1L);

        verify(bookRepository).findById(1L);
        verify(koboUserSettingsRepository, never()).findByAutoAddToShelfTrueAndSyncEnabledTrue();
        verify(shelfRepository, never()).findByUserIdInAndName(anyList(), anyString());
        verify(bookRepository, never()).save(any());
    }

    @Test
    void autoAddBookToKoboShelves_withIncompatibleBook_shouldReturnEarly() {
        when(bookRepository.findById(1L)).thenReturn(Optional.of(testBook));
        when(koboCompatibilityService.isBookSupportedForKobo(testBook)).thenReturn(false);

        koboAutoShelfService.autoAddBookToKoboShelves(1L);

        verify(bookRepository).findById(1L);
        verify(koboCompatibilityService).isBookSupportedForKobo(testBook);
        verify(koboUserSettingsRepository, never()).findByAutoAddToShelfTrueAndSyncEnabledTrue();
        verify(shelfRepository, never()).findByUserIdInAndName(anyList(), anyString());
        verify(bookRepository, never()).save(any());
    }

    @Test
    void autoAddBookToKoboShelves_withNoEligibleUsers_shouldReturnEarly() {
        when(bookRepository.findById(1L)).thenReturn(Optional.of(testBook));
        when(koboCompatibilityService.isBookSupportedForKobo(testBook)).thenReturn(true);
        when(koboUserSettingsRepository.findByAutoAddToShelfTrueAndSyncEnabledTrue())
                .thenReturn(Collections.emptyList());

        koboAutoShelfService.autoAddBookToKoboShelves(1L);

        verify(bookRepository).findById(1L);
        verify(koboCompatibilityService).isBookSupportedForKobo(testBook);
        verify(koboUserSettingsRepository).findByAutoAddToShelfTrueAndSyncEnabledTrue();
        verify(shelfRepository, never()).findByUserIdInAndName(anyList(), anyString());
        verify(bookRepository, never()).save(any());
    }

    @Test
    void autoAddBookToKoboShelves_successfully_shouldAddBookToShelves() {
        when(bookRepository.findById(1L)).thenReturn(Optional.of(testBook));
        when(koboCompatibilityService.isBookSupportedForKobo(testBook)).thenReturn(true);
        when(koboUserSettingsRepository.findByAutoAddToShelfTrueAndSyncEnabledTrue())
                .thenReturn(List.of(settings1, settings2));
        when(shelfRepository.findByUserIdInAndName(List.of(100L, 200L), ShelfType.KOBO.getName()))
                .thenReturn(List.of(koboShelf1, koboShelf2));

        koboAutoShelfService.autoAddBookToKoboShelves(1L);

        verify(bookRepository).findById(1L);
        verify(koboCompatibilityService).isBookSupportedForKobo(testBook);
        verify(koboUserSettingsRepository).findByAutoAddToShelfTrueAndSyncEnabledTrue();
        verify(shelfRepository).findByUserIdInAndName(List.of(100L, 200L), ShelfType.KOBO.getName());
        verify(bookRepository).save(testBook);

        assert testBook.getShelves().contains(koboShelf1);
        assert testBook.getShelves().contains(koboShelf2);
        assert testBook.getShelves().size() == 2;
    }

    @Test
    void autoAddBookToKoboShelves_withOneUserMissingShelf_shouldAddOnlyToExistingShelves() {
        when(bookRepository.findById(1L)).thenReturn(Optional.of(testBook));
        when(koboCompatibilityService.isBookSupportedForKobo(testBook)).thenReturn(true);
        when(koboUserSettingsRepository.findByAutoAddToShelfTrueAndSyncEnabledTrue())
                .thenReturn(List.of(settings1, settings2));
        when(shelfRepository.findByUserIdInAndName(List.of(100L, 200L), ShelfType.KOBO.getName()))
                .thenReturn(List.of(koboShelf1));

        koboAutoShelfService.autoAddBookToKoboShelves(1L);

        verify(bookRepository).save(testBook);
        assert testBook.getShelves().contains(koboShelf1);
        assert !testBook.getShelves().contains(koboShelf2);
        assert testBook.getShelves().size() == 1;
    }

    @Test
    void autoAddBookToKoboShelves_withBookAlreadyOnShelf_shouldNotDuplicate() {
        testBook.getShelves().add(koboShelf1);

        when(bookRepository.findById(1L)).thenReturn(Optional.of(testBook));
        when(koboCompatibilityService.isBookSupportedForKobo(testBook)).thenReturn(true);
        when(koboUserSettingsRepository.findByAutoAddToShelfTrueAndSyncEnabledTrue())
                .thenReturn(List.of(settings1, settings2));
        when(shelfRepository.findByUserIdInAndName(List.of(100L, 200L), ShelfType.KOBO.getName()))
                .thenReturn(List.of(koboShelf1, koboShelf2));

        koboAutoShelfService.autoAddBookToKoboShelves(1L);

        verify(bookRepository).save(testBook);
        assert testBook.getShelves().contains(koboShelf1);
        assert testBook.getShelves().contains(koboShelf2);
        assert testBook.getShelves().size() == 2;
    }

    @Test
    void autoAddBookToKoboShelves_withBookOnAllShelves_shouldNotSave() {
        testBook.getShelves().add(koboShelf1);
        testBook.getShelves().add(koboShelf2);

        when(bookRepository.findById(1L)).thenReturn(Optional.of(testBook));
        when(koboCompatibilityService.isBookSupportedForKobo(testBook)).thenReturn(true);
        when(koboUserSettingsRepository.findByAutoAddToShelfTrueAndSyncEnabledTrue())
                .thenReturn(List.of(settings1, settings2));
        when(shelfRepository.findByUserIdInAndName(List.of(100L, 200L), ShelfType.KOBO.getName()))
                .thenReturn(List.of(koboShelf1, koboShelf2));

        koboAutoShelfService.autoAddBookToKoboShelves(1L);

        verify(bookRepository, never()).save(any());
        assert testBook.getShelves().size() == 2;
    }

    @Test
    void autoAddBookToKoboShelves_withNoKoboShelvesFound_shouldNotSave() {
        when(bookRepository.findById(1L)).thenReturn(Optional.of(testBook));
        when(koboCompatibilityService.isBookSupportedForKobo(testBook)).thenReturn(true);
        when(koboUserSettingsRepository.findByAutoAddToShelfTrueAndSyncEnabledTrue())
                .thenReturn(List.of(settings1, settings2));
        when(shelfRepository.findByUserIdInAndName(List.of(100L, 200L), ShelfType.KOBO.getName()))
                .thenReturn(Collections.emptyList());

        koboAutoShelfService.autoAddBookToKoboShelves(1L);

        verify(shelfRepository).findByUserIdInAndName(List.of(100L, 200L), ShelfType.KOBO.getName());
        verify(bookRepository, never()).save(any());
        assert testBook.getShelves().isEmpty();
    }

    @Test
    void autoAddBookToKoboShelves_withSingleUser_shouldAddToSingleShelf() {
        when(bookRepository.findById(1L)).thenReturn(Optional.of(testBook));
        when(koboCompatibilityService.isBookSupportedForKobo(testBook)).thenReturn(true);
        when(koboUserSettingsRepository.findByAutoAddToShelfTrueAndSyncEnabledTrue())
                .thenReturn(List.of(settings1));
        when(shelfRepository.findByUserIdInAndName(List.of(100L), ShelfType.KOBO.getName()))
                .thenReturn(List.of(koboShelf1));

        koboAutoShelfService.autoAddBookToKoboShelves(1L);

        verify(bookRepository).save(testBook);
        assert testBook.getShelves().contains(koboShelf1);
        assert testBook.getShelves().size() == 1;
    }

    @Test
    void autoAddBookToKoboShelves_withNullShelves_shouldInitializeAndAdd() {
        testBook = BookEntity.builder()
                .id(1L)
                .shelves(null)
                .build();

        when(bookRepository.findById(1L)).thenReturn(Optional.of(testBook));
        when(koboCompatibilityService.isBookSupportedForKobo(testBook)).thenReturn(true);
        when(koboUserSettingsRepository.findByAutoAddToShelfTrueAndSyncEnabledTrue())
                .thenReturn(List.of(settings1));
        when(shelfRepository.findByUserIdInAndName(List.of(100L), ShelfType.KOBO.getName()))
                .thenReturn(List.of(koboShelf1));

        koboAutoShelfService.autoAddBookToKoboShelves(1L);

        verify(bookRepository).save(testBook);
        assert testBook.getShelves() != null;
        assert testBook.getShelves().contains(koboShelf1);
        assert testBook.getShelves().size() == 1;
    }
}
