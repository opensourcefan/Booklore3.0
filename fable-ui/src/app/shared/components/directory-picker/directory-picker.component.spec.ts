import {TestBed} from '@angular/core/testing';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Observable, of} from 'rxjs';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import {TranslocoTestingModule} from '@jsverse/transloco';

import {DirectoryPickerComponent} from './directory-picker.component';
import {UtilityService} from './utility.service';

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
    getFolders: (path: string) => Observable<string[]>;
  };

  beforeEach(async () => {
    localStorage.clear();

    utilityServiceMock = {
      getFolders: (path: string) => {
        if (path === '/library') {
          return of(['/library/child']);
        }

        return of(['/library', '/exact']);
      }
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
              existingFolders: ['/library/child', '/exact']
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

});