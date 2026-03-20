import {Component, inject, OnInit} from '@angular/core';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import {Book, BookType} from '../../model/book.model';
import {MessageService} from 'primeng/api';
import {finalize} from 'rxjs';
import {BookService} from '../../service/book.service';
import {Button} from 'primeng/button';
import {Checkbox} from 'primeng/checkbox';
import {FormsModule} from '@angular/forms';
import {LoadingService} from '../../../../core/services/loading.service';
import {InputText} from 'primeng/inputtext';
import {IconField} from 'primeng/iconfield';
import {InputIcon} from 'primeng/inputicon';

@Component({
  selector: 'app-book-type-assigner',
  standalone: true,
  templateUrl: './book-type-assigner.component.html',
  styleUrl: './book-type-assigner.component.scss',
  imports: [
    Button,
    Checkbox,
    FormsModule,
    InputText,
    IconField,
    InputIcon,
  ]
})
export class BookTypeAssignerComponent implements OnInit {
  private dynamicDialogConfig = inject(DynamicDialogConfig);
  private dynamicDialogRef = inject(DynamicDialogRef);
  private messageService = inject(MessageService);
  private bookService = inject(BookService);
  private loadingService = inject(LoadingService);

  readonly allBookTypes: BookType[] = ['PDF', 'EPUB', 'CBX', 'FB2', 'MOBI', 'AZW3', 'AUDIOBOOK'];

  searchQuery = '';
  selectedBookType: BookType | null = null;

  book: Book = this.dynamicDialogConfig.data.book;
  bookIds: Set<number> = this.dynamicDialogConfig.data.bookIds;
  isMultiBooks: boolean = this.dynamicDialogConfig.data.isMultiBooks;

  ngOnInit(): void {
    if (!this.isMultiBooks) {
      this.selectedBookType = this.book?.primaryFile?.bookType ?? null;
    }
  }

  isBookTypeSelected(bookType: BookType): boolean {
    return this.selectedBookType === bookType;
  }

  setSelectedBookType(bookType: BookType): void {
    this.selectedBookType = this.selectedBookType === bookType ? null : bookType;
  }

  onBookTypeCheckboxChange(bookType: BookType, checked: boolean): void {
    this.selectedBookType = checked ? bookType : null;
  }

  updateBookType(): void {
    if (!this.selectedBookType) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Select Book Type',
        detail: 'Choose a book type before saving.'
      });
      return;
    }

    const ids = this.isMultiBooks ? this.bookIds : new Set([this.book.id]);
    const loader = this.loadingService.show(`Updating book type for ${ids.size} book${ids.size === 1 ? '' : 's'}...`);

    this.bookService.updateBookType(ids, this.selectedBookType)
      .pipe(finalize(() => this.loadingService.hide(loader)))
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'Book type updated successfully.'
          });
          this.dynamicDialogRef.close({assigned: true});
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to update book type.'
          });
          this.dynamicDialogRef.close({assigned: false});
        }
      });
  }

  filterBookTypes(bookTypes: BookType[]): BookType[] {
    if (!this.searchQuery.trim()) {
      return bookTypes;
    }
    const query = this.searchQuery.trim().toLowerCase();
    return bookTypes.filter(bookType => bookType.toLowerCase().includes(query));
  }

  closeDialog(): void {
    this.dynamicDialogRef.close({assigned: false});
  }
}
