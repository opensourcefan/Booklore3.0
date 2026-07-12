import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {TestBed} from '@angular/core/testing';
import {BehaviorSubject, of} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import {MessageService} from 'primeng/api';
import {provideNoopAnimations} from '@angular/platform-browser/animations';
import {By} from '@angular/platform-browser';

import {StoryArcAssignerComponent} from './story-arc-assigner.component';
import {StoryArcService} from '../../service/story-arc.service';
import {FailureNotificationService} from '../../../../shared/service/failure-notification.service';
import {StoryArcSummary} from '../../model/story-arc.model';
import {Select} from 'primeng/select';

describe('StoryArcAssignerComponent overlay scrolling', () => {
  const storyArcs$ = new BehaviorSubject<StoryArcSummary[]>([
    {
      storyArcName: 'Cosmic Odyssey',
      bookCount: 12,
      readBookCount: 3,
      completionPercent: 25
    }
  ]);

  const storyArcServiceMock = {
    storyArcs$,
    loadStoryArcs: vi.fn(),
    getStoryArc: vi.fn(() => of([])),
    bulkAdd: vi.fn(() => of(void 0))
  };

  beforeEach(async () => {
    storyArcServiceMock.loadStoryArcs.mockClear();

    await TestBed.configureTestingModule({
      imports: [StoryArcAssignerComponent],
      providers: [
        provideNoopAnimations(),
        MessageService,
        {provide: StoryArcService, useValue: storyArcServiceMock},
        {provide: DynamicDialogConfig, useValue: {data: {bookIds: new Set([10, 11])}}},
        {provide: DynamicDialogRef, useValue: {close: vi.fn()}},
        {provide: FailureNotificationService, useValue: {reportSafe: vi.fn()}}
      ]
    }).compileComponents();
  });

  it('templates both selects with appendTo body to avoid nested dialog scroll fighting', () => {
    const templatePath = join(
      process.cwd(),
      'src/app/features/story-arc/components/story-arc-assigner/story-arc-assigner.component.html'
    );
    const template = readFileSync(templatePath, 'utf8');

    expect(template).toMatch(/id="story-arc-select"[\s\S]*?appendTo="body"/);
    expect(template).toMatch(/id="chapter-select"[\s\S]*?appendTo="body"/);
    expect(template).toMatch(/id="chapter-select"[\s\S]*?scrollHeight="280px"/);
  });

  it('wires appendTo body on the story arc Select instance', () => {
    const fixture = TestBed.createComponent(StoryArcAssignerComponent);
    fixture.detectChanges();

    const arcSelect = fixture.debugElement.query(By.directive(Select));
    expect(arcSelect).not.toBeNull();
    expect(arcSelect.componentInstance.appendTo()).toBe('body');
  });
});
