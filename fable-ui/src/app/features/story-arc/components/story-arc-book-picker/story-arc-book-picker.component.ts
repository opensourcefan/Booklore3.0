import {Component, inject, OnInit} from '@angular/core';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import {FormsModule} from '@angular/forms';
import {CommonModule} from '@angular/common';
import {Button} from 'primeng/button';
import {CheckboxModule} from 'primeng/checkbox';
import {ScrollerModule} from 'primeng/scroller';
import {BookService} from '../../../book/service/book.service';
import {UrlHelperService} from '../../../../shared/service/url-helper.service';
import {Book} from '../../../book/model/book.model';
import {debounceTime, distinctUntilChanged, Subject, switchMap, BehaviorSubject} from 'rxjs';

@Component({
  selector: 'app-story-arc-book-picker',
  standalone: true,
  templateUrl: './story-arc-book-picker.component.html',
  styleUrls: ['./story-arc-book-picker.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    Button,
    CheckboxModule,
    ScrollerModule
  ]
})
export class StoryArcBookPickerComponent implements OnInit {
  private dynamicDialogConfig = inject(DynamicDialogConfig);
  private dynamicDialogRef = inject(DynamicDialogRef);
  private bookService = inject(BookService);
  private urlHelper = inject(UrlHelperService);

  chapterTitle: string = this.dynamicDialogConfig.data?.chapterTitle || 'Chapter';
  searchTerm$ = new BehaviorSubject<string>('');
  selectedBookIds = new Set<number>();
  books: Book[] = [];
  loading = false;

  private searchSubject = new Subject<string>();

  ngOnInit(): void {
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(term => {
        this.loading = true;
        return this.bookService.getBooksPaged({
          page: 0,
          size: 50,
          search: term || undefined,
          sorts: ['metadata.title,asc']
        });
      })
    ).subscribe({
      next: (response) => {
        this.books = response.content.map(s => s as unknown as Book);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });

    // Initial load
    this.searchSubject.next('');
  }

  onSearchChange(value: string): void {
    this.searchTerm$.next(value);
    this.searchSubject.next(value);
  }

  toggleBook(bookId: number): void {
    if (this.selectedBookIds.has(bookId)) {
      this.selectedBookIds.delete(bookId);
    } else {
      this.selectedBookIds.add(bookId);
    }
  }

  isSelected(bookId: number): boolean {
    return this.selectedBookIds.has(bookId);
  }

  getThumbnail(bookId: number): string {
    return this.urlHelper.getDirectThumbnailUrl(bookId);
  }

  confirm(): void {
    this.dynamicDialogRef.close({
      bookIds: Array.from(this.selectedBookIds)
    });
  }

  cancel(): void {
    this.dynamicDialogRef.close(null);
  }
}
