import {Component, DestroyRef, inject, OnInit, ViewChild} from '@angular/core';
import {CommonModule} from '@angular/common';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import {FetchedProposal, MetadataTaskService} from '../../../book/service/metadata-task';
import {BookService} from '../../../book/service/book.service';
import {Book} from '../../../book/model/book.model';
import {BehaviorSubject, Observable, of} from 'rxjs';
import {finalize, map, switchMap, tap} from 'rxjs/operators';
import {ProgressSpinner} from 'primeng/progressspinner';
import {Button} from 'primeng/button';
import {ProgressBar} from 'primeng/progressbar';
import {Tooltip} from 'primeng/tooltip';
import {MetadataProgressService} from '../../../../shared/service/metadata-progress.service';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {MetadataPickerComponent} from '../book-metadata-center/metadata-picker/metadata-picker.component';

@Component({
  selector: 'app-metadata-review-dialog-component',
  standalone: true,
  templateUrl: './metadata-review-dialog-component.html',
  styleUrls: ['./metadata-review-dialog-component.scss'],
  imports: [CommonModule, MetadataPickerComponent, ProgressSpinner, Button, ProgressBar, Tooltip],
})
export class MetadataReviewDialogComponent implements OnInit {

  @ViewChild(MetadataPickerComponent)
  pickerComponent!: MetadataPickerComponent;

  private config = inject(DynamicDialogConfig);
  private dialogRef = inject(DynamicDialogRef);
  private metadataTaskService = inject(MetadataTaskService);
  private bookService = inject(BookService);
  private progressService = inject(MetadataProgressService);
  private destroyRef = inject(DestroyRef);

  proposals: FetchedProposal[] = [];
  currentBooks: Record<number, Book> = {};
  loading = true;
  currentIndex = 0;
  processingAction: 'save' | 'quick' | null = null;
  private initialized = false;

  private currentIndexSubject = new BehaviorSubject<number>(0);

  book$: Observable<Book | null> = this.currentIndexSubject.pipe(
    map(idx => {
      const proposal = this.proposals[idx];
      if (!proposal) return null;
      return this.currentBooks[proposal.bookId] ?? null;
    })
  );

  ngOnInit() {
    const taskId = this.config.data?.taskId;
    if (!taskId) {
      this.dialogRef.close();
      return;
    }

    this.metadataTaskService.getTaskWithProposals(taskId).subscribe({
      next: (task) => {
        this.proposals = task.proposals || [];
        const bookIds = new Set(this.proposals.map(p => p.bookId));

        this.bookService.bookState$
          .pipe(
            map(bookState => bookState.books?.filter(book => bookIds.has(book.id)) ?? []),
            takeUntilDestroyed(this.destroyRef)
          )
          .subscribe((matchedBooks) => {

            if (!this.initialized && matchedBooks.length === bookIds.size) {
              this.currentBooks = matchedBooks.reduce((map, book) => {
                map[book.id] = book;
                return map;
              }, {} as Record<number, Book>);
              this.loading = false;
              this.currentIndex = 0;
              this.currentIndexSubject.next(0);
              this.initialized = true;
            } else if (!this.initialized) {
              this.loading = true;
            }
          });
      },
      error: () => {
        this.dialogRef.close();
      },
    });
  }

  get currentProposal(): FetchedProposal | null {
    return this.proposals[this.currentIndex] ?? null;
  }

  get isBusy(): boolean {
    return this.processingAction !== null || this.pickerComponent?.isSaving === true;
  }

  get quickActionLabel(): string {
    return this.isLast ? 'Copy All, Save & Finish' : 'Copy All, Save & Next';
  }

  onSave(): void {
    this.persistCurrentProposal('save', false);
  }

  onCopyAllSaveAndAdvance(): void {
    this.pickerComponent?.copyAll();
    this.persistCurrentProposal('quick', true);
  }

  onSkip(): void {
    if (this.isBusy || !this.currentProposal) {
      return;
    }

    if (this.currentIndex >= this.proposals.length - 1) {
      this.close();
      return;
    }

    const [skipped] = this.proposals.splice(this.currentIndex, 1);
    this.proposals = [...this.proposals, skipped];
    this.currentIndexSubject.next(this.currentIndex);
  }

  onCopyMissing(): void {
    this.pickerComponent?.copyMissing();
  }

  onCopyAll(): void {
    this.pickerComponent?.copyAll();
  }

  private persistCurrentProposal(action: 'save' | 'quick', advanceAfterSave: boolean): void {
    const currentProposal = this.currentProposal;
    if (!currentProposal || !this.pickerComponent || this.isBusy) return;

    this.processingAction = action;
    const shouldDeleteTask = this.isLast;

    this.pickerComponent.saveMetadata().pipe(
      switchMap(() => this.metadataTaskService.updateProposalStatus(currentProposal.taskId, currentProposal.proposalId, 'ACCEPTED')),
      switchMap(() => shouldDeleteTask
        ? this.metadataTaskService.deleteTask(currentProposal.taskId).pipe(
          tap(() => {
            this.progressService.clearTask(currentProposal.taskId);
          })
        )
        : of(void 0)
      ),
      finalize(() => {
        this.processingAction = null;
      })
    ).subscribe({
      next: () => {
        if (advanceAfterSave || shouldDeleteTask) {
          this.onNext();
        }
      },
      error: () => {
        // The picker already reports save failures to the user. Keep the
        // current proposal open so the review can be corrected and retried.
      }
    });
  }

  onNext(): void {
    const nextIndex = this.currentIndex + 1;
    if (nextIndex >= this.proposals.length) {
      this.dialogRef.close();
    } else {
      this.currentIndex = nextIndex;
      this.currentIndexSubject.next(nextIndex);
    }
  }

  lockAllMetadata(): void {
    if (this.isBusy) return;
    this.pickerComponent?.lockAll();
  }

  unlockAllMetadata(): void {
    if (this.isBusy) return;
    this.pickerComponent?.unlockAll();
  }

  get isLast(): boolean {
    return this.currentIndex === this.proposals.length - 1;
  }

  close(): void {
    this.dialogRef.close();
  }
}
