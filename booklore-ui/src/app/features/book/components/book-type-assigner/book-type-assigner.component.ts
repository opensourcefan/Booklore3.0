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
import {LocalStorageService} from '../../../../shared/service/local-storage.service';
import {BookDialogHelperService} from '../book-browser/book-dialog-helper.service';

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
  private localStorageService = inject(LocalStorageService);
  private bookDialogHelper = inject(BookDialogHelperService);

  private readonly customMediaTypesKey = 'customMediaTypes';

  allFileTypes: string[] = [];

  searchQuery = '';
  selectedFileType: string | null = null;

  book: Book = this.dynamicDialogConfig.data.book;
  bookIds: Set<number> = this.dynamicDialogConfig.data.bookIds;
  isMultiBooks: boolean = this.dynamicDialogConfig.data.isMultiBooks;

  ngOnInit(): void {
    this.reloadFileTypes();

    if (!this.isMultiBooks) {
      this.selectedFileType = this.book?.fileType ?? null;
    }
  }

  private reloadFileTypes(): void {
    const books = this.bookService.getCurrentBookState().books ?? [];
    const assignedTypes = books
      .map(item => item.fileType?.trim())
      .filter((item): item is string => !!item);
    this.allFileTypes = this.mergeTypes(assignedTypes, this.getStoredCustomBookTypes());
    this.persistCustomBookTypes(this.allFileTypes);
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

  createBookTypeDialog(): void {
    const dialogRef = this.bookDialogHelper.openBookTypeCreatorDialog();

    dialogRef.onClose.subscribe((result: {created?: boolean; type?: string} | boolean) => {
      if (!result) {
        return;
      }

      const created = typeof result === 'boolean' ? result : !!result.created;
      if (!created) {
        return;
      }

      this.reloadFileTypes();
      if (typeof result === 'object' && result.type) {
        this.selectedFileType = result.type;
      }
    });
  }

  updateFileType(): void {
    const normalizedFileType = this.selectedFileType?.trim() || null;
    this.persistFileType(normalizedFileType);
  }

  private persistFileType(fileType: string | null): void {
    if (fileType) {
      this.persistCustomBookTypes(this.mergeTypes(this.allFileTypes, [fileType]));
    }

    const payloadFileType = fileType ?? '';
    const ids = this.isMultiBooks ? this.bookIds : new Set([this.book.id]);
    const loader = this.loadingService.show(`Updating media type for ${ids.size} asset${ids.size === 1 ? '' : 's'}...`);

    this.bookService.updateFileType(ids, payloadFileType)
      .pipe(finalize(() => this.loadingService.hide(loader)))
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Success',
            detail: fileType ? 'Media type updated successfully.' : 'Media type cleared successfully.'
          });
          this.dynamicDialogRef.close({assigned: true});
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Failed to update media type.'
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

  private getStoredCustomBookTypes(): string[] {
    return this.localStorageService.get<string[]>(this.customMediaTypesKey)
      ?? this.localStorageService.get<string[]>('customBookTypes')
      ?? [];
  }

  private persistCustomBookTypes(types: string[]): void {
    this.localStorageService.set(this.customMediaTypesKey, this.mergeTypes(types));
    this.localStorageService.remove('customBookTypes');
  }

  private mergeTypes(...sources: string[][]): string[] {
    const merged: string[] = [];
    for (const source of sources) {
      for (const rawType of source) {
        const type = rawType.trim();
        if (!type) {
          continue;
        }
        if (!merged.some(existing => existing.toLowerCase() === type.toLowerCase())) {
          merged.push(type);
        }
      }
    }
    return merged.sort((a, b) => a.localeCompare(b));
  }
}
