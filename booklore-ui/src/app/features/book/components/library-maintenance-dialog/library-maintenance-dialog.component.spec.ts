import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {of} from 'rxjs';
import {ConfirmationService, MessageService} from 'primeng/api';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import {LibraryMaintenanceDialogComponent} from './library-maintenance-dialog.component';
import {LibraryService} from '../../service/library.service';
import {SidecarService} from '../../../metadata/service/sidecar.service';
import {TranslocoService} from '@jsverse/transloco';

describe('LibraryMaintenanceDialogComponent', () => {
  let component: LibraryMaintenanceDialogComponent;
  let confirmationConfig: Parameters<ConfirmationService['confirm']>[0] | undefined;
  let libraryServiceMock: {
    findLibraryById: ReturnType<typeof vi.fn>;
    refreshLibrary: ReturnType<typeof vi.fn>;
  };
  let sidecarServiceMock: {
    bulkExport: ReturnType<typeof vi.fn>;
    backupLibrarySidecars: ReturnType<typeof vi.fn>;
    bulkImport: ReturnType<typeof vi.fn>;
  };
  let messageServiceMock: {add: ReturnType<typeof vi.fn>};

  beforeEach(() => {
    confirmationConfig = undefined;
    libraryServiceMock = {
      findLibraryById: vi.fn().mockReturnValue({id: 42, name: 'Main Library'}),
      refreshLibrary: vi.fn().mockReturnValue(of(void 0))
    };
    sidecarServiceMock = {
      bulkExport: vi.fn().mockReturnValue(of({message: 'ok', exported: 12})),
      backupLibrarySidecars: vi.fn().mockReturnValue(of({message: 'ok', attempted: 12, exported: 12, failed: 0, firstError: ''})),
      bulkImport: vi.fn().mockReturnValue(of({message: 'ok', imported: 4}))
    };
    messageServiceMock = {add: vi.fn()};

    TestBed.configureTestingModule({
      providers: [
        {provide: DynamicDialogRef, useValue: {close: vi.fn()}},
        {provide: DynamicDialogConfig, useValue: {data: {libraryId: 42}}},
        {provide: ConfirmationService, useValue: {confirm: vi.fn((config: Parameters<ConfirmationService['confirm']>[0]) => { confirmationConfig = config; })}},
        {provide: MessageService, useValue: messageServiceMock},
        {provide: LibraryService, useValue: libraryServiceMock},
        {provide: SidecarService, useValue: sidecarServiceMock},
        {provide: TranslocoService, useValue: {translate: (key: string, params?: Record<string, unknown>) => params ? `${key}${JSON.stringify(params)}` : key}}
      ]
    });

    component = TestBed.runInInjectionContext(() => new LibraryMaintenanceDialogComponent());
    component.ngOnInit();
  });

  function acceptConfirmation(): void {
    expect(confirmationConfig?.accept).toBeTypeOf('function');
    confirmationConfig?.accept?.();
  }

  it('loads the selected library from dialog data', () => {
    expect(libraryServiceMock.findLibraryById).toHaveBeenCalledWith(42);
    expect(component.library?.name).toBe('Main Library');
  });

  it('reconciles the library from the maintenance dialog', () => {
    component.confirmReconcile();
    acceptConfirmation();

    expect(libraryServiceMock.refreshLibrary).toHaveBeenCalledWith(42);
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
});