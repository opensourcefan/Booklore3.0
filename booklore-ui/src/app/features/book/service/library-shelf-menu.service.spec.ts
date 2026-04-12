import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {of, throwError} from 'rxjs';
import {ConfirmationService, MenuItem, MenuItemCommandEvent, MessageService} from 'primeng/api';
import {Router} from '@angular/router';
import {LibraryShelfMenuService} from './library-shelf-menu.service';
import {LibraryService} from './library.service';
import {ShelfService} from './shelf.service';
import {TaskHelperService} from '../../settings/task-management/task-helper.service';
import {MagicShelfService} from '../../magic-shelf/service/magic-shelf.service';
import {UserService} from '../../settings/user-management/user.service';
import {WriteProgressService} from '../../../shared/service/write-progress.service';
import {DialogLauncherService} from '../../../shared/services/dialog-launcher.service';
import {BookDialogHelperService} from '../components/book-browser/book-dialog-helper.service';
import {TranslocoService} from '@jsverse/transloco';
import {Library} from '../model/library.model';

describe('LibraryShelfMenuService', () => {
  let service: LibraryShelfMenuService;
  let confirmationConfig: Parameters<ConfirmationService['confirm']>[0] | undefined;
  let libraryServiceMock: {
    scanLibraryForNewFiles: ReturnType<typeof vi.fn>;
    refreshLibrary: ReturnType<typeof vi.fn>;
    deleteLibrary: ReturnType<typeof vi.fn>;
  };
  let messageServiceMock: { add: ReturnType<typeof vi.fn> };
  let dialogLauncherMock: { openLibraryEditDialog: ReturnType<typeof vi.fn>; openLibrarySettingsDialog: ReturnType<typeof vi.fn>; openLibraryDirectoriesDialog: ReturnType<typeof vi.fn>; openShelfEditDialog: ReturnType<typeof vi.fn>; openMagicShelfEditDialog: ReturnType<typeof vi.fn>; openLibraryMetadataFetchDialog: ReturnType<typeof vi.fn>; openLibraryMaintenanceDialog: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    confirmationConfig = undefined;
    libraryServiceMock = {
      scanLibraryForNewFiles: vi.fn().mockReturnValue(of(void 0)),
      refreshLibrary: vi.fn().mockReturnValue(of(void 0)),
      deleteLibrary: vi.fn().mockReturnValue(of(void 0))
    };
    messageServiceMock = {add: vi.fn()};
    dialogLauncherMock = {
      openLibraryEditDialog: vi.fn(),
      openLibrarySettingsDialog: vi.fn(),
      openLibraryDirectoriesDialog: vi.fn(),
      openShelfEditDialog: vi.fn(),
      openMagicShelfEditDialog: vi.fn(),
      openLibraryMetadataFetchDialog: vi.fn(),
      openLibraryMaintenanceDialog: vi.fn()
    };

    TestBed.configureTestingModule({
      providers: [
        LibraryShelfMenuService,
        {provide: ConfirmationService, useValue: {confirm: vi.fn((config: Parameters<ConfirmationService['confirm']>[0]) => { confirmationConfig = config; })}},
        {provide: MessageService, useValue: messageServiceMock},
        {provide: LibraryService, useValue: libraryServiceMock},
        {provide: ShelfService, useValue: {deleteShelf: vi.fn()}},
        {provide: TaskHelperService, useValue: {refreshMetadataTask: vi.fn().mockReturnValue(of(void 0))}},
        {provide: Router, useValue: {navigate: vi.fn()}},
        {provide: DialogLauncherService, useValue: dialogLauncherMock},
        {provide: MagicShelfService, useValue: {deleteShelf: vi.fn()}},
        {provide: UserService, useValue: {getCurrentUser: vi.fn().mockReturnValue({id: 1, permissions: {admin: true}})}},
        {provide: WriteProgressService, useValue: {show: vi.fn(), complete: vi.fn(), fail: vi.fn()}},
        {provide: BookDialogHelperService, useValue: {openAddPhysicalBookDialog: vi.fn(), openBulkIsbnImportDialog: vi.fn(), openDuplicateMergerDialog: vi.fn()}},
        {provide: TranslocoService, useValue: {translate: (key: string) => key}}
      ]
    });

    service = TestBed.inject(LibraryShelfMenuService);
  });

  function createLibrary(): Library {
    return {
      id: 42,
      name: 'Main',
      watch: false,
      paths: []
    };
  }

  function createMenuEvent(item: MenuItem | undefined): MenuItemCommandEvent {
    return {
      originalEvent: new Event('click'),
      item
    };
  }

  function acceptConfirmation(): void {
    expect(confirmationConfig?.accept).toBeTypeOf('function');
    confirmationConfig?.accept?.();
  }

  it('includes separate settings, directories, scan, and maintenance actions for libraries', () => {
    const menu = service.initializeLibraryMenuItems(createLibrary());
    const labels = menu.filter(item => !item.separator).map(item => item.label);

    expect(labels).toContain('book.shelfMenuService.library.librarySettings');
    expect(labels).toContain('book.shelfMenuService.library.manageDirectories');
    expect(labels).toContain('book.shelfMenuService.library.scanNewFiles');
    expect(labels).toContain('book.shelfMenuService.library.libraryMaintenance');
    expect(labels).not.toContain('book.shelfMenuService.library.editLibrary');
  });

  it('opens separate dialogs for library settings and directory management', () => {
    const menu = service.initializeLibraryMenuItems(createLibrary());
    const settingsItem = menu.find(item => item.label === 'book.shelfMenuService.library.librarySettings');
    const directoriesItem = menu.find(item => item.label === 'book.shelfMenuService.library.manageDirectories');

    settingsItem?.command?.(createMenuEvent(settingsItem));
    directoriesItem?.command?.(createMenuEvent(directoriesItem));

    expect(dialogLauncherMock.openLibrarySettingsDialog).toHaveBeenCalledWith(42);
    expect(dialogLauncherMock.openLibraryDirectoriesDialog).toHaveBeenCalledWith(42);
  });

  it('runs scan-for-new-files through the dedicated library service method', () => {
    const menu = service.initializeLibraryMenuItems(createLibrary());
    const scanItem = menu.find(item => item.label === 'book.shelfMenuService.library.scanNewFiles');

    scanItem?.command?.(createMenuEvent(scanItem));
    acceptConfirmation();

    expect(libraryServiceMock.scanLibraryForNewFiles).toHaveBeenCalledWith(42);
    expect(libraryServiceMock.refreshLibrary).not.toHaveBeenCalled();
  });

  it('opens the maintenance dialog for risky library-wide actions', () => {
    const menu = service.initializeLibraryMenuItems(createLibrary());
    const maintenanceItem = menu.find(item => item.label === 'book.shelfMenuService.library.libraryMaintenance');

    maintenanceItem?.command?.(createMenuEvent(maintenanceItem));

    expect(dialogLauncherMock.openLibraryMaintenanceDialog).toHaveBeenCalledWith(42);
    expect(libraryServiceMock.refreshLibrary).not.toHaveBeenCalled();
  });

  it('shows an error toast when the new-file scan fails', () => {
    libraryServiceMock.scanLibraryForNewFiles.mockReturnValue(throwError(() => new Error('failed')));
    const menu = service.initializeLibraryMenuItems(createLibrary());
    const scanItem = menu.find(item => item.label === 'book.shelfMenuService.library.scanNewFiles');

    scanItem?.command?.(createMenuEvent(scanItem));
    acceptConfirmation();

    expect(messageServiceMock.add).toHaveBeenCalledWith(expect.objectContaining({
      severity: 'error',
      detail: 'book.shelfMenuService.toast.scanNewFilesFailedDetail'
    }));
  });
});