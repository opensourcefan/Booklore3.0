import {Component, inject, OnInit} from '@angular/core';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import {Book} from '../../model/book.model';
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

  allFileTypes: string[] = [];

  searchQuery = '';
  newFileType = '';
  selectedFileType: string | null = null;

  book: Book = this.dynamicDialogConfig.data.book;
  bookIds: Set<number> = this.dynamicDialogConfig.data.bookIds;
  isMultiBooks: boolean = this.dynamicDialogConfig.data.isMultiBooks;

  ngOnInit(): void {
    const books = this.bookService.getCurrentBookState().books ?? [];
    this.allFileTypes = [...new Set(books
      .map(item => item.fileType?.trim())
      .filter((item): item is string => !!item))]
      .sort((a, b) => a.localeCompare(b));

    if (!this.isMultiBooks) {
      this.selectedFileType = this.book?.fileType ?? null;
    }
  }

  isFileTypeSelected(fileType: string): boolean {
    return this.selectedFileType === fileType;
  }

  setSelectedFileType(fileType: string): void {
    this.selectedFileType = this.selectedFileType === fileType ? null : fileType;
  }

  onFileTypeCheckboxChange(fileType: string, checked: boolean): void {
    this.selectedFileType = checked ? fileType : null;
  }

  createFileType(): void {
    const candidate = this.newFileType.trim();
    if (!candidate) {
      return;
    }

    const exists = this.allFileTypes.some(type => type.toLowerCase() === candidate.toLowerCase());
    if (!exists) {
      this.allFileTypes = [...this.allFileTypes, candidate].sort((a, b) => a.localeCompare(b));
    }

    this.selectedFileType = this.allFileTypes.find(type => type.toLowerCase() === candidate.toLowerCase()) ?? candidate;
    this.newFileType = '';
  }

  updateFileType(): void {
    const normalizedFileType = this.selectedFileType?.trim() || null;
    this.persistFileType(normalizedFileType);
  }

  removeFileType(): void {
    this.selectedFileType = null;
    this.persistFileType(null);
  }

  private persistFileType(fileType: string | null): void {
    const payloadFileType = fileType ?? '';
    const ids = this.isMultiBooks ? this.bookIds : new Set([this.book.id]);
    const loader = this.loadingService.show(`Updating book type for ${ids.size} book${ids.size === 1 ? '' : 's'}...`);

    this.bookService.updateFileType(ids, payloadFileType)
      .pipe(finalize(() => this.loadingService.hide(loader)))
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: fileType ? 'Book type updated successfully.' : 'Book type cleared successfully.'
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

  filterFileTypes(fileTypes: string[]): string[] {
    if (!this.searchQuery.trim()) {
      return fileTypes;
    }
    const query = this.searchQuery.trim().toLowerCase();
    return fileTypes.filter(fileType => fileType.toLowerCase().includes(query));
  }

  closeDialog(): void {
    this.dynamicDialogRef.close({assigned: false});
  }
}
