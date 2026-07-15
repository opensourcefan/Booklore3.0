import {TestBed} from '@angular/core/testing';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Observable, of} from 'rxjs';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import {TranslocoTestingModule} from '@jsverse/transloco';

import {DirectoryPickerComponent} from './directory-picker.component';
import {UtilityService} from './utility.service';
import {UserService} from '../../../features/settings/user-management/user.service';
import {LibraryService} from '../../../features/book/service/library.service';

describe('DirectoryPickerComponent import badges', () => {
  const translations = {
    shared: {
      directoryPicker: {
        title: 'Select Directories',
        description: 'Choose one or more directories from your file system',
        currentPath: 'Current Path:',
        searchPlaceholder: 'Search folders...',
        goUpTooltip: 'Go up one level',
        selectAllBtn: 'Select All',
        selectAllTooltip: 'Select all visible folders',
        deselectAllBtn: 'Deselect All',
        deselectAllTooltip: 'Clear all selections',
        selectCurrentBtn: 'Select Current',
        selectCurrentTooltip: 'Select the current directory',
        foldersSelected: '{{ count }} folder selected',
        foldersSelectedPlural: '{{ count }} folders selected',
        loadingDirectories: 'Loading directories...',
        noMatchesFound: 'No Matches Found',
        directoryEmpty: 'Directory is Empty',
        noMatchesDescription: 'No folders match your search criteria.',
        emptyDescription: 'This directory does not contain any subfolders.',
        folderAvailable: '{{ count }} folder available',
        foldersAvailable: '{{ count }} folders available',
        folderWillBeSelected: '{{ count }} folder will be selected',
        foldersWillBeSelected: '{{ count }} folders will be selected',
        selectDirectoriesBtn: 'Select Directories',
        recentLabel: 'Recent:',
        importedBadge: 'Imported',
        alreadyImported: 'Already Imported',
        subdirectoriesImported: 'Subdirectories Imported',
        importedVisible: '{{ count }} already imported here',
        importedVisiblePlural: '{{ count }} already imported here'
      }
    },
    common: {
      cancel: 'Cancel'
    }
  };

  let utilityServiceMock: {
    getFolders: ReturnType<typeof vi.fn<(path: string) => Observable<string[]>>>;
  };
  let userServiceMock: {
    getCurrentUser: ReturnType<typeof vi.fn>;
  };
  let libraryServiceMock: {
    getLibrariesFromState: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    localStorage.clear();

    utilityServiceMock = {
      getFolders: vi.fn((path: string) => {
        if (path === '/library') {
          return of(['/library/child']);
        }
        if (path === '/books') {
          return of(['/books/fiction']);
        }
        if (path === '/books/_users/4') {
          return of(['/books/_users/4/uploads']);
        }

        return of(['/library', '/exact']);
      })
    };

    userServiceMock = {
      getCurrentUser: vi.fn(() => ({
        id: 1,
        permissions: {admin: true},
        assignedLibraries: []
      }))
    };

    libraryServiceMock = {
      getLibrariesFromState: vi.fn(() => [])
    };

    await TestBed.configureTestingModule({
      imports: [
        DirectoryPickerComponent,
        TranslocoTestingModule.forRoot({
          langs: {en: translations},
          translocoConfig: {
            availableLangs: ['en'],
            defaultLang: 'en'
          }
        })
      ],
      providers: [
        {
          provide: DynamicDialogConfig,
          useValue: {
            data: {
              existingFolders: ['/library/child', '/exact'],
              initialPath: '/'
            }
          }
        },
        {
          provide: DynamicDialogRef,
          useValue: {
            close: vi.fn()
          }
        },
        {
          provide: UtilityService,
          useValue: utilityServiceMock
        },
        {
          provide: UserService,
          useValue: userServiceMock
        },
        {
          provide: LibraryService,
          useValue: libraryServiceMock
        }
      ]
    }).compileComponents();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('shows a dedicated subdirectories-imported badge when only descendant folders are imported', async () => {
    const fixture = TestBed.createComponent(DirectoryPickerComponent);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const libraryRow = Array.from(root.querySelectorAll('.directory-item')).find(item =>
      item.textContent?.includes('/library')
    ) as HTMLElement;
    const exactRow = Array.from(root.querySelectorAll('.directory-item')).find(item =>
      item.textContent?.includes('/exact')
    ) as HTMLElement;

    const descendantBadge = libraryRow.querySelector('.imported-chip--descendant') as HTMLElement;
    const exactBadge = exactRow.querySelector('.imported-chip:not(.imported-chip--descendant)') as HTMLElement;

    expect(descendantBadge).not.toBeNull();
    expect(descendantBadge.textContent).toContain('Subdirectories Imported');
    expect(exactBadge).not.toBeNull();
    expect(exactBadge.textContent).toContain('Already Imported');
  });

  it('starts admins at / by default with no UI jail', async () => {
    TestBed.resetTestingModule();
    utilityServiceMock.getFolders.mockClear();
    await TestBed.configureTestingModule({
      imports: [
        DirectoryPickerComponent,
        TranslocoTestingModule.forRoot({
          langs: {en: translations},
          translocoConfig: {
            availableLangs: ['en'],
            defaultLang: 'en'
          }
        })
      ],
      providers: [
        {provide: DynamicDialogConfig, useValue: {data: {existingFolders: []}}},
        {provide: DynamicDialogRef, useValue: {close: vi.fn()}},
        {provide: UtilityService, useValue: utilityServiceMock},
        {
          provide: UserService,
          useValue: {
            getCurrentUser: () => ({
              id: 1,
              permissions: {admin: true},
              assignedLibraries: []
            })
          }
        },
        {provide: LibraryService, useValue: libraryServiceMock}
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(DirectoryPickerComponent);
    fixture.detectChanges();

    expect(utilityServiceMock.getFolders).toHaveBeenCalledWith('/');
    expect(fixture.componentInstance.browseRoot).toBe('/');
    expect(fixture.componentInstance.isAtBrowseRoot()).toBe(true);
    expect(fixture.componentInstance['isWithinBrowseRoot']('/mnt/nas')).toBe(true);
  });

  it('starts non-admins at their personal library path', async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [
        DirectoryPickerComponent,
        TranslocoTestingModule.forRoot({
          langs: {en: translations},
          translocoConfig: {
            availableLangs: ['en'],
            defaultLang: 'en'
          }
        })
      ],
      providers: [
        {provide: DynamicDialogConfig, useValue: {data: {existingFolders: []}}},
        {provide: DynamicDialogRef, useValue: {close: vi.fn()}},
        {provide: UtilityService, useValue: utilityServiceMock},
        {
          provide: UserService,
          useValue: {
            getCurrentUser: () => ({
              id: 4,
              permissions: {admin: false, canManageLibrary: true},
              assignedLibraries: [{
                id: 9,
                name: "guest's Library",
                ownerUserId: 4,
                paths: [{path: '/books/_users/4'}],
                watch: true
              }]
            })
          }
        },
        {
          provide: LibraryService,
          useValue: {
            getLibrariesFromState: () => [{
              id: 9,
              name: "guest's Library",
              ownerUserId: 4,
              paths: [{path: '/books/_users/4'}],
              watch: true
            }]
          }
        }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(DirectoryPickerComponent);
    fixture.detectChanges();

    expect(utilityServiceMock.getFolders).toHaveBeenCalledWith('/books/_users/4');
    expect(fixture.componentInstance.browseRoot).toBe('/books/_users/4');
  });

});
