import {TestBed} from '@angular/core/testing';
import {ActivatedRoute, convertToParamMap, Router} from '@angular/router';
import {BehaviorSubject, of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ConfirmationService, MessageService} from 'primeng/api';
import {provideNoopAnimations} from '@angular/platform-browser/animations';

import {StoryArcPageComponent} from './story-arc-page.component';
import {StoryArcService} from '../../service/story-arc.service';
import {UrlHelperService} from '../../../../shared/service/url-helper.service';
import {PageTitleService} from '../../../../shared/service/page-title.service';
import {BookPatchService} from '../../../book/service/book-patch.service';
import {DialogLauncherService} from '../../../../shared/services/dialog-launcher.service';
import {MobileUxService} from '../../../../core/services/mobile-ux.service';
import {StoryArcBookMapping} from '../../model/story-arc.model';

describe('StoryArcPageComponent drag affordances', () => {
  const mobileMode$ = new BehaviorSubject(false);

  const sampleMappings: StoryArcBookMapping[] = [
    {
      storyArcName: 'Test Arc',
      bookId: 101,
      rowIndex: 0,
      colIndex: 0,
      sequenceOrder: 1,
      isCore: true,
      rowTitle: 'Chapter 1',
      book: {
        id: 101,
        metadata: {title: 'Issue One', series: 'Test Series'},
        readStatus: 'UNREAD'
      } as StoryArcBookMapping['book']
    },
    {
      storyArcName: 'Test Arc',
      bookId: 102,
      rowIndex: 0,
      colIndex: 1,
      sequenceOrder: 2,
      isCore: true,
      rowTitle: 'Chapter 1',
      book: {
        id: 102,
        metadata: {title: 'Issue Two', series: 'Test Series'},
        readStatus: 'UNREAD'
      } as StoryArcBookMapping['book']
    }
  ];

  const storyArcServiceMock = {
    getStoryArc: vi.fn(() => of(sampleMappings)),
    saveLayout: vi.fn(() => of(void 0)),
    removeBooksFromStoryArc: vi.fn(() => of(void 0)),
    setCoverBook: vi.fn(() => of(void 0)),
    deleteStoryArc: vi.fn(() => of(void 0)),
    bulkAdd: vi.fn(() => of(void 0))
  };

  const urlHelperMock = {
    getDirectThumbnailUrl: vi.fn((id: number) => `/thumb/${id}`),
    getBookPrimaryReadingUrl: vi.fn(() => '/read/101')
  };

  beforeEach(async () => {
    mobileMode$.next(false);
    storyArcServiceMock.getStoryArc.mockClear();
    storyArcServiceMock.saveLayout.mockClear();

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        media: '',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    });

    await TestBed.configureTestingModule({
      imports: [StoryArcPageComponent],
      providers: [
        provideNoopAnimations(),
        MessageService,
        ConfirmationService,
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({arcName: 'Test%20Arc'}))
          }
        },
        {provide: Router, useValue: {navigate: vi.fn(), url: '/story-arcs/test'}},
        {provide: StoryArcService, useValue: storyArcServiceMock},
        {provide: UrlHelperService, useValue: urlHelperMock},
        {provide: PageTitleService, useValue: {setPageTitle: vi.fn()}},
        {provide: BookPatchService, useValue: {updateBookReadStatus: vi.fn(() => of(void 0))}},
        {provide: DialogLauncherService, useValue: {openDialog: vi.fn()}},
        {
          provide: MobileUxService,
          useValue: {
            isMobileInteractionMode: false,
            isMobileInteractionMode$: mobileMode$.asObservable()
          }
        }
      ]
    }).compileComponents();
  });

  function createFixture() {
    const fixture = TestBed.createComponent(StoryArcPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('decodes percent-encoded story arc route names before loading', () => {
    const fixture = createFixture();
    expect(fixture.componentInstance.arcName).toBe('Test Arc');
    expect(storyArcServiceMock.getStoryArc).toHaveBeenCalledWith('Test Arc');
  });

  it('renders cover drag handles only in edit mode card view', () => {
    const fixture = createFixture();
    expect(fixture.nativeElement.querySelector('.cover-drag-handle')).toBeNull();
    expect(fixture.nativeElement.querySelector('.row-drag-handle')).toBeNull();

    fixture.componentInstance.toggleEditMode();
    fixture.detectChanges();

    const handles = fixture.nativeElement.querySelectorAll('.cover-drag-handle');
    expect(handles.length).toBe(2);
    expect(fixture.nativeElement.querySelector('.row-drag-handle')).toBeNull();
    expect(fixture.nativeElement.querySelector('.sort-drag-handle')).toBeNull();
  });

  it('uses chapter sort drag handles instead of cover handles in chapter sort mode', () => {
    const fixture = createFixture();
    fixture.componentInstance.toggleEditMode();
    fixture.componentInstance.toggleChapterSortMode();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('.sort-drag-handle').length).toBe(1);
    expect(fixture.nativeElement.querySelector('.cover-drag-handle')).toBeNull();
    expect(fixture.nativeElement.querySelector('.row-drag-handle')).toBeNull();
  });

  it('disables comic card drag outside edit mode', () => {
    const fixture = createFixture();

    const cards = fixture.nativeElement.querySelectorAll('.comic-flow-card');
    expect(cards.length).toBeGreaterThan(0);
    for (const card of Array.from(cards) as HTMLElement[]) {
      expect(card.classList.contains('draggable')).toBe(false);
    }

    fixture.componentInstance.toggleEditMode();
    fixture.detectChanges();

    const draggableCards = fixture.nativeElement.querySelectorAll('.comic-flow-card.draggable');
    expect(draggableCards.length).toBe(2);
  });

  it('uses vertical drop-list orientation on mobile and horizontal on desktop', () => {
    const fixture = createFixture();
    const component = fixture.componentInstance;

    expect(component.bookDropListOrientation).toBe('horizontal');

    component.isMobile = true;
    expect(component.bookDropListOrientation).toBe('vertical');

    mobileMode$.next(true);
    expect(component.bookDropListOrientation).toBe('vertical');
  });

  it('binds vertical drop-list orientation when mobile', () => {
    const fixture = createFixture();
    fixture.componentInstance.isMobile = true;
    fixture.detectChanges();

    expect(fixture.componentInstance.bookDropListOrientation).toBe('vertical');
    expect(fixture.nativeElement.querySelector('.row-drop-list')).not.toBeNull();
  });
});
