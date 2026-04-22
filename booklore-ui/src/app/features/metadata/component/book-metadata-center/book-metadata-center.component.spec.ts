import {Component, Input} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {convertToParamMap, ActivatedRoute, Router} from '@angular/router';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {of, Subject} from 'rxjs';
import {TranslocoDirective, TranslocoTestingModule} from '@jsverse/transloco';
import {Button} from 'primeng/button';
import {Tab, TabList, TabPanel, TabPanels, Tabs} from 'primeng/tabs';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';

import {BookMetadataCenterComponent} from './book-metadata-center.component';
import {BookService} from '../../../book/service/book.service';
import {UserService} from '../../../settings/user-management/user.service';
import {AppSettingsService} from '../../../../shared/service/app-settings.service';
import {BookMetadataHostService} from '../../../../shared/service/book-metadata-host.service';

@Component({selector: 'app-metadata-viewer', standalone: true, template: ''})
class StubMetadataViewerComponent {
  @Input() book$!: unknown;
  @Input() recommendedBooks!: unknown;
}

@Component({selector: 'app-metadata-editor', standalone: true, template: ''})
class StubMetadataEditorComponent {
  @Input() book$!: unknown;
}

@Component({selector: 'app-metadata-searcher', standalone: true, template: ''})
class StubMetadataSearcherComponent {
  @Input() book$!: unknown;
  @Input() isActiveTab = false;
}

@Component({selector: 'app-sidecar-viewer', standalone: true, template: ''})
class StubSidecarViewerComponent {
  @Input() book$!: unknown;
}

describe('BookMetadataCenterComponent dialog sizing', () => {
  beforeEach(async () => {
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: class {
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      }
    });

    TestBed.overrideComponent(BookMetadataCenterComponent, {
      set: {
        imports: [
          Tabs,
          TabList,
          Tab,
          TabPanels,
          TabPanel,
          StubMetadataViewerComponent,
          StubMetadataEditorComponent,
          StubMetadataSearcherComponent,
          StubSidecarViewerComponent,
          Button,
          TranslocoDirective
        ]
      }
    });

    await TestBed.configureTestingModule({
      imports: [
        BookMetadataCenterComponent,
        TranslocoTestingModule.forRoot({
          langs: {en: {metadata: {center: {title: 'Metadata', description: 'Description', tabView: 'View', tabEdit: 'Edit', tabSearch: 'Search', tabSidecar: 'Sidecar'}}}},
          translocoConfig: {
            availableLangs: ['en'],
            defaultLang: 'en'
          }
        })
      ],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({bookId: '1'})),
            queryParamMap: of(convertToParamMap({tab: 'match'}))
          }
        },
        {
          provide: Router,
          useValue: {
            navigate: vi.fn(),
            navigateByUrl: vi.fn(),
            url: '/all-books/1'
          }
        },
        {
          provide: BookService,
          useValue: {
            bookState$: of({books: [{id: 1, metadata: {title: 'Alpha'}, isPhysical: false}]}),
            getBookByIdFromAPI: vi.fn().mockReturnValue(of({id: 1, metadata: {title: 'Alpha'}, isPhysical: false})),
            getBookRecommendations: vi.fn().mockReturnValue(of([]))
          }
        },
        {
          provide: UserService,
          useValue: {
            userState$: of({
              loaded: true,
              user: {
                permissions: {canEditMetadata: true, admin: true},
                userSettings: {}
              }
            })
          }
        },
        {
          provide: AppSettingsService,
          useValue: {
            appSettings$: of({diskType: 'LOCAL', similarBookRecommendation: false})
          }
        },
        {
          provide: BookMetadataHostService,
          useValue: {
            bookSwitches$: new Subject<number | null>()
          }
        },
        {
          provide: DynamicDialogConfig,
          useValue: {
            data: {
              bookId: 1
            }
          }
        },
        {
          provide: DynamicDialogRef,
          useValue: {
            close: vi.fn()
          }
        }
      ]
    }).compileComponents();
  });

  it('marks dialog tab panels with the dialog sizing class when opened inside Book Details', () => {
    const fixture = TestBed.createComponent(BookMetadataCenterComponent);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const tabsWrapper = root.querySelector('.tabs-wrapper.dialog-mode') as HTMLElement;
    const tabPanels = root.querySelector('p-tabpanels.tabpanels-responsive.dialog-tabpanels') as HTMLElement;

    expect(tabsWrapper).not.toBeNull();
    expect(tabPanels).not.toBeNull();
  });
});