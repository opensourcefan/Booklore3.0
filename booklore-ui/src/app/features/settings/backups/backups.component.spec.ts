import {ComponentFixture, TestBed} from '@angular/core/testing';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {ConfirmationService, MessageService} from 'primeng/api';
import {of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {LibraryService} from '../../book/service/library.service';
import {SidecarService} from '../../metadata/service/sidecar.service';
import {AppSettingsService} from '../../../shared/service/app-settings.service';
import {LocalStorageService} from '../../../shared/service/local-storage.service';
import {SidecarBackupProgressService} from '../../../shared/service/sidecar-backup-progress.service';
import {UserService} from '../user-management/user.service';
import {BackupsComponent} from './backups.component';

describe('BackupsComponent', () => {
  let fixture: ComponentFixture<BackupsComponent>;
  let component: BackupsComponent;
  let storage: Record<string, unknown>;
  let appSettingsServiceMock: {exportSettings: ReturnType<typeof vi.fn>; importSettings: ReturnType<typeof vi.fn>};
  let sidecarServiceMock: {backupLibrarySidecars: ReturnType<typeof vi.fn>};
  let clipboardWriteText: ReturnType<typeof vi.fn>;
  let messageServiceAdd: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    storage = {};
    clipboardWriteText = vi.fn().mockResolvedValue(undefined);
    messageServiceAdd = vi.fn();

    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: class {
        observe() {
          return undefined;
        }
        unobserve() {
          return undefined;
        }
        disconnect() {
          return undefined;
        }
      }
    });

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {writeText: clipboardWriteText}
    });

    appSettingsServiceMock = {
      exportSettings: vi.fn(() => of('booklore-settings-2026-04-14T12-00-00-000Z.json')),
      importSettings: vi.fn(() => of(void 0))
    };

    sidecarServiceMock = {
      backupLibrarySidecars: vi.fn(() => of({
        message: 'ok',
        attempted: 12,
        exported: 12,
        failed: 0,
        firstError: ''
      }))
    };

    TestBed.configureTestingModule({
      imports: [
        BackupsComponent,
        TranslocoTestingModule.forRoot({langs: {}})
      ],
      providers: [
        {
          provide: UserService,
          useValue: {
            userState$: of({
              loaded: true,
              user: {
                permissions: {
                  admin: true,
                  canManageGlobalPreferences: true,
                  canManageMetadataConfig: true
                }
              }
            })
          }
        },
        {provide: AppSettingsService, useValue: appSettingsServiceMock},
        {
          provide: LibraryService,
          useValue: {
            libraryState$: of({
              loaded: true,
              libraries: [{id: 1, name: 'Main Library'}]
            })
          }
        },
        {provide: SidecarService, useValue: sidecarServiceMock},
        {
          provide: LocalStorageService,
          useValue: {
            get: vi.fn((key: string) => (storage[key] as unknown) ?? null),
            set: vi.fn((key: string, value: unknown) => {
              storage[key] = value;
            }),
            remove: vi.fn()
          }
        },
        {
          provide: SidecarBackupProgressService,
          useValue: {
            start: vi.fn(),
            clear: vi.fn()
          }
        },
        {
          provide: ConfirmationService,
          useValue: {
            confirm: vi.fn((options: {accept?: () => void}) => options.accept?.())
          }
        },
        {
          provide: MessageService,
          useValue: {
            add: messageServiceAdd
          }
        }
      ]
    });

    fixture = TestBed.createComponent(BackupsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('records app-settings export activity', () => {
    component.exportSettings();

    expect(appSettingsServiceMock.exportSettings).toHaveBeenCalledOnce();
    expect(storage.settingsBackupsAppSettingsActivity).toMatchObject({
      action: 'export',
      fileName: 'booklore-settings-2026-04-14T12-00-00-000Z.json'
    });
    expect(messageServiceAdd).toHaveBeenCalled();
  });

  it('backs up sidecars and records the selected library', () => {
    component.selectedBackupLibraryId = 1;

    component.backupLibrarySidecars();

    expect(sidecarServiceMock.backupLibrarySidecars).toHaveBeenCalledWith(1);
    expect(storage.settingsBackupsSidecarActivity).toMatchObject({
      libraryId: 1,
      libraryName: 'Main Library',
      exported: 12,
      failed: 0
    });
  });

  it('copies the restore command only after a successful pre-flight', async () => {
    component.restoreSqlPath = '/tmp/booklore_backup.sql';
    component.restoreAppDataPath = '/srv/booklore/data';
    component.restoreComposePath = '/opt/booklore/docker-compose.yml';
    component.availableSpaceGb = 42;
    component.packageFilesConfirmed = true;
    component.libraryMediaCopied = true;
    component.appDataConfirmed = true;
    component.deploymentConfigConfirmed = true;
    component.versionConfirmed = true;
    component.maintenanceReady = true;

    component.runRestorePreflight();
    await component.copyDatabaseRestoreCommand();

    expect(component.restoreReady).toBe(true);
    expect(clipboardWriteText).toHaveBeenCalledWith(
      'docker exec -i mariadb mariadb -u booklore -p booklore < "/tmp/booklore_backup.sql"'
    );
    expect(storage.settingsBackupsDatabaseActivity).toMatchObject({
      action: 'restore-command',
      outputPath: '/tmp/booklore_backup.sql'
    });
  });
});