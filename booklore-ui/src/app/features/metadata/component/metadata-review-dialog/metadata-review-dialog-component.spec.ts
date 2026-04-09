import {Component, EventEmitter, Input, Output} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {By} from '@angular/platform-browser';
import {BehaviorSubject, of, Subject, throwError} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import {MetadataReviewDialogComponent} from './metadata-review-dialog-component';
import {MetadataPickerComponent} from '../book-metadata-center/metadata-picker/metadata-picker.component';
import {MetadataTaskService, FetchedMetadataProposalStatus, FetchedProposal, MetadataFetchTask} from '../../../book/service/metadata-task';
import {BookService} from '../../../book/service/book.service';
import {Book, BookMetadata} from '../../../book/model/book.model';
import {MetadataProgressService} from '../../../../shared/service/metadata-progress.service';

@Component({
  selector: 'app-metadata-picker',
  standalone: true,
  template: ''
})
class MetadataPickerStubComponent {
  @Input() reviewMode!: boolean;
  @Input() fetchedMetadata!: BookMetadata;
  @Input() book$!: unknown;
  @Input() detailLoading = false;
  @Input() reviewQuickActionLabel: string | null = null;
  @Input() reviewActionBusy = false;
  @Input() reviewActionDisabled = false;
  @Output() goBack = new EventEmitter<boolean>();
  @Output() reviewQuickAction = new EventEmitter<void>();

  isSaving = false;
  copyMissing = vi.fn();
  copyAll = vi.fn();
  lockAll = vi.fn();
  unlockAll = vi.fn();
  saveMetadata = vi.fn(() => of(void 0));
}

function createProposal(proposalId: number, bookId: number): FetchedProposal {
  return {
    proposalId,
    taskId: 'task-1',
    bookId,
    fetchedAt: '2026-04-09T00:00:00Z',
    reviewedAt: null,
    reviewerUserId: null,
    status: FetchedMetadataProposalStatus.FETCHED,
    metadataJson: {bookId} as BookMetadata,
  };
}

function createBook(bookId: number): Book {
  return {
    id: bookId,
    metadata: {bookId} as BookMetadata,
  } as Book;
}

describe('MetadataReviewDialogComponent', () => {
  function createTask(): MetadataFetchTask {
    return {
      id: 'task-1',
      status: 'COMPLETED',
      completed: 0,
      totalBooks: 3,
      startedAt: '2026-04-09T00:00:00Z',
      completedAt: '2026-04-09T00:01:00Z',
      initiatedBy: '1',
      errorMessage: null,
      proposals: [createProposal(1, 11), createProposal(2, 22), createProposal(3, 33)],
    };
  }

  const metadataTaskServiceMock = {
    getTaskWithProposals: vi.fn(() => of(createTask())),
    updateProposalStatus: vi.fn(() => of(void 0)),
    deleteTask: vi.fn(() => of(void 0)),
  };

  const dialogRefMock = {
    close: vi.fn(),
  };

  const progressServiceMock = {
    clearTask: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [MetadataReviewDialogComponent],
      providers: [
        {provide: DynamicDialogConfig, useValue: {data: {taskId: 'task-1'}}},
        {provide: DynamicDialogRef, useValue: dialogRefMock},
        {provide: MetadataTaskService, useValue: metadataTaskServiceMock},
        {
          provide: BookService,
          useValue: {
            bookState$: new BehaviorSubject({loaded: true, books: [createBook(11), createBook(22), createBook(33)]}),
          },
        },
        {provide: MetadataProgressService, useValue: progressServiceMock},
      ]
    })
      .overrideComponent(MetadataReviewDialogComponent, {
        remove: {imports: [MetadataPickerComponent]},
        add: {imports: [MetadataPickerStubComponent]},
      })
      .compileComponents();
  });

  function createComponent() {
    const fixture = TestBed.createComponent(MetadataReviewDialogComponent);
    fixture.detectChanges();
    fixture.detectChanges();
    const picker = fixture.debugElement.query(By.directive(MetadataPickerStubComponent)).componentInstance as MetadataPickerStubComponent;
    fixture.componentInstance.pickerComponent = picker as unknown as MetadataPickerComponent;
    return {
      fixture,
      component: fixture.componentInstance,
      picker,
    };
  }

  it('moves skipped proposals to the end and shows the next review immediately', () => {
    const {component} = createComponent();

    component.onSkip();

    expect(component.proposals.map(proposal => proposal.proposalId)).toEqual([2, 3, 1]);
    expect(component.currentProposal?.proposalId).toBe(2);
  });

  it('copy-all save-and-next waits for the save and accept calls before advancing', () => {
    const {component, picker} = createComponent();
    const saveSubject = new Subject<undefined>();
    const acceptSubject = new Subject<undefined>();

    picker.saveMetadata.mockReturnValue(saveSubject.asObservable());
    metadataTaskServiceMock.updateProposalStatus.mockReturnValue(acceptSubject.asObservable());

    component.onCopyAllSaveAndAdvance();

    expect(picker.copyAll).toHaveBeenCalledOnce();
    expect(component.currentProposal?.proposalId).toBe(1);

    saveSubject.next(undefined);
    saveSubject.complete();

    expect(metadataTaskServiceMock.updateProposalStatus).toHaveBeenCalledWith('task-1', 1, 'ACCEPTED');
    expect(component.currentProposal?.proposalId).toBe(1);

    acceptSubject.next(undefined);
    acceptSubject.complete();

    expect(component.currentProposal?.proposalId).toBe(2);
  });

  it('does not advance when save fails', () => {
    const {component, picker} = createComponent();

    picker.saveMetadata.mockReturnValue(throwError(() => new Error('save failed')));

    component.onCopyAllSaveAndAdvance();

    expect(metadataTaskServiceMock.updateProposalStatus).not.toHaveBeenCalled();
    expect(component.currentProposal?.proposalId).toBe(1);
  });

  it('deletes the task, clears progress, and closes when the last review is accepted through the quick action', () => {
    const {component, picker} = createComponent();

    component.onNext();
    component.onNext();
    picker.saveMetadata.mockReturnValue(of(void 0));
    metadataTaskServiceMock.updateProposalStatus.mockReturnValue(of(void 0));
    metadataTaskServiceMock.deleteTask.mockReturnValue(of(void 0));

    component.onCopyAllSaveAndAdvance();

    expect(metadataTaskServiceMock.updateProposalStatus).toHaveBeenCalledWith('task-1', 3, 'ACCEPTED');
    expect(metadataTaskServiceMock.deleteTask).toHaveBeenCalledWith('task-1');
    expect(progressServiceMock.clearTask).toHaveBeenCalledWith('task-1');
    expect(dialogRefMock.close).toHaveBeenCalled();
  });
});