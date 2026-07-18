import {TestBed} from '@angular/core/testing';
import {Router} from '@angular/router';
import {BehaviorSubject, of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {MessageService} from 'primeng/api';
import {provideNoopAnimations} from '@angular/platform-browser/animations';

import {StoryArcBrowserComponent} from './story-arc-browser.component';
import {StoryArcService} from '../../service/story-arc.service';
import {UrlHelperService} from '../../../../shared/service/url-helper.service';
import {PageTitleService} from '../../../../shared/service/page-title.service';
import {StoryArcSummary} from '../../model/story-arc.model';

describe('StoryArcBrowserComponent create flow', () => {
  const arcs$ = new BehaviorSubject<StoryArcSummary[]>([
    {
      storyArcName: 'Existing Arc',
      bookCount: 2,
      readBookCount: 1,
      completionPercent: 50
    }
  ]);

  const routerMock = {
    navigate: vi.fn(() => Promise.resolve(true))
  };

  const messageServiceMock = {
    add: vi.fn()
  };

  beforeEach(async () => {
    routerMock.navigate.mockClear();
    messageServiceMock.add.mockClear();

    await TestBed.configureTestingModule({
      imports: [StoryArcBrowserComponent],
      providers: [
        provideNoopAnimations(),
        {
          provide: StoryArcService,
          useValue: {
            storyArcs$: arcs$.asObservable(),
            loadStoryArcs: vi.fn(),
            getStoryArc: vi.fn(() => of([]))
          }
        },
        {provide: UrlHelperService, useValue: {getDirectThumbnailUrl: vi.fn(() => 'thumb.jpg')}},
        {provide: PageTitleService, useValue: {setPageTitle: vi.fn()}},
        {provide: Router, useValue: routerMock},
        {provide: MessageService, useValue: messageServiceMock}
      ]
    }).compileComponents();
  });

  it('renders a New Story Arc button that opens the create dialog', () => {
    const fixture = TestBed.createComponent(StoryArcBrowserComponent);
    fixture.detectChanges();

    const buttonHost = fixture.nativeElement.querySelector('.new-arc-btn') as HTMLElement;
    expect(buttonHost).not.toBeNull();

    const clickable = (buttonHost.matches('button') ? buttonHost : buttonHost.querySelector('button')) as HTMLElement;
    expect(clickable).not.toBeNull();
    clickable.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.createDialogVisible).toBe(true);
    expect(fixture.nativeElement.querySelector('#new-story-arc-name')).not.toBeNull();
  });

  it('navigates to a blank reading path in edit mode after create', () => {
    const fixture = TestBed.createComponent(StoryArcBrowserComponent);
    fixture.detectChanges();

    fixture.componentInstance.openCreateDialog();
    fixture.componentInstance.newArcName = '  Infinite Crisis  ';
    fixture.componentInstance.confirmCreateArc();

    expect(routerMock.navigate).toHaveBeenCalledWith(
      ['/story-arc', 'Infinite Crisis'],
      {state: {startInEditMode: true}}
    );
    expect(fixture.componentInstance.createDialogVisible).toBe(false);
  });

  it('blocks create when the name is empty or already exists', () => {
    const fixture = TestBed.createComponent(StoryArcBrowserComponent);
    fixture.detectChanges();

    fixture.componentInstance.openCreateDialog();
    fixture.componentInstance.newArcName = '   ';
    fixture.componentInstance.confirmCreateArc();
    expect(routerMock.navigate).not.toHaveBeenCalled();

    fixture.componentInstance.newArcName = 'Existing Arc';
    fixture.componentInstance.confirmCreateArc();
    expect(routerMock.navigate).not.toHaveBeenCalled();
    expect(messageServiceMock.add).toHaveBeenCalled();
  });
});
