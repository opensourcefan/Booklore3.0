import {TestBed} from '@angular/core/testing';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {of} from 'rxjs';
import {ConfirmationService, MessageService} from 'primeng/api';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import {LibraryMaintenanceDialogComponent} from './library-maintenance-dialog.component';
import {LibraryService} from '../../service/library.service';
import {SidecarService} from '../../../metadata/service/sidecar.service';
import {TranslocoService} from '@jsverse/transloco';
import {DialogLauncherService} from '../../../../shared/services/dialog-launcher.service';

describe('LibraryMaintenanceDialogComponent', () => {
  let component: LibraryMaintenanceDialogComponent;
  let confirmationConfig: Parameters<ConfirmationService['confirm']>[0] | undefined;
  let libraryServiceMock: {
    findLibraryById: ReturnType<typeof vi.fn>;
    scanLibraryForNewFiles: ReturnType<typeof vi.fn>;
    refreshLibrary: ReturnType<typeof vi.fn>;
  };
  let sidecarServiceMock: {
    bulkExport: ReturnType<typeof vi.fn>;
    backupLibrarySidecars: ReturnType<typeof vi.fn>;
    bulkImport: ReturnType<typeof vi.fn>;
  };
  let messageServiceMock: {add: ReturnType<typeof vi.fn>};
  let dialogRefMock: {close: ReturnType<typeof vi.fn>};
  let dialogLauncherServiceMock: {
    openLibrarySettingsDialog: ReturnType<typeof vi.fn>;
    openLibraryDirectoriesDialog: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    confirmationConfig = undefined;
    libraryServiceMock = {
      findLibraryById: vi.fn().mockReturnValue({id: 42, name: 'Main Library'}),
      scanLibraryForNewFiles: vi.fn().mockReturnValue(of(void 0)),
      refreshLibrary: vi.fn().mockReturnValue(of(void 0))
    };
    sidecarServiceMock = {
      bulkExport: vi.fn().mockReturnValue(of({message: 'ok', exported: 12})),
      backupLibrarySidecars: vi.fn().mockReturnValue(of({message: 'ok', attempted: 12, exported: 12, failed: 0, firstError: ''})),
      bulkImport: vi.fn().mockReturnValue(of({message: 'ok', imported: 4}))
    };
    messageServiceMock = {add: vi.fn()};
    dialogRefMock = {close: vi.fn()};
    dialogLauncherServiceMock = {
      openLibrarySettingsDialog: vi.fn(),
      openLibraryDirectoriesDialog: vi.fn()
    };

    TestBed.configureTestingModule({
      providers: [
        {provide: DynamicDialogRef, useValue: dialogRefMock},
        {provide: DynamicDialogConfig, useValue: {data: {libraryId: 42}}},
        {provide: ConfirmationService, useValue: {confirm: vi.fn((config: Parameters<ConfirmationService['confirm']>[0]) => { confirmationConfig = config; })}},
        {provide: MessageService, useValue: messageServiceMock},
        {provide: LibraryService, useValue: libraryServiceMock},
        {provide: SidecarService, useValue: sidecarServiceMock},
        {provide: DialogLauncherService, useValue: dialogLauncherServiceMock},
        {provide: TranslocoService, useValue: {translate: (key: string, params?: Record<string, unknown>) => params ? `${key}${JSON.stringify(params)}` : key}}
      ]
    });

    component = TestBed.runInInjectionContext(() => new LibraryMaintenanceDialogComponent());
    component.ngOnInit();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function acceptConfirmation(): void {
    expect(confirmationConfig?.accept).toBeTypeOf('function');
    confirmationConfig?.accept?.();
  }

  it('loads the selected library from dialog data', () => {
    expect(libraryServiceMock.findLibraryById).toHaveBeenCalledWith(42);
    expect(component.library?.name).toBe('Main Library');
  });

  it('does not prompt reconcile until acknowledged', () => {
    component.confirmReconcile();

    expect(confirmationConfig).toBeUndefined();
    expect(libraryServiceMock.refreshLibrary).not.toHaveBeenCalled();
  });

  it('reconciles the library from the maintenance dialog', () => {
    component.reconcileAcknowledged = true;
    component.confirmReconcile();
    acceptConfirmation();

    expect(libraryServiceMock.refreshLibrary).toHaveBeenCalledWith(42);
  });

  it('scans for new files from the maintenance dialog', () => {
    component.confirmScanNewFiles();
    acceptConfirmation();

    expect(libraryServiceMock.scanLibraryForNewFiles).toHaveBeenCalledWith(42);
  });

  it('exports sidecars from the maintenance dialog', () => {
    component.confirmSidecarExport();
    acceptConfirmation();

    expect(sidecarServiceMock.bulkExport).toHaveBeenCalledWith(42);
  });

  it('imports sidecars from the maintenance dialog', () => {
    component.confirmSidecarImport();
    acceptConfirmation();

    expect(sidecarServiceMock.bulkImport).toHaveBeenCalledWith(42);
  });

  it('closes before opening library settings', () => {
    component.openLibrarySettings();

    expect(dialogRefMock.close).toHaveBeenCalledTimes(1);
    expect(dialogLauncherServiceMock.openLibrarySettingsDialog).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(dialogLauncherServiceMock.openLibrarySettingsDialog).toHaveBeenCalledWith(42);
  });

  it('closes before opening manage directories', () => {
    component.openManageDirectories();

    expect(dialogRefMock.close).toHaveBeenCalledTimes(1);
    expect(dialogLauncherServiceMock.openLibraryDirectoriesDialog).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(dialogLauncherServiceMock.openLibraryDirectoriesDialog).toHaveBeenCalledWith(42);
  });
});