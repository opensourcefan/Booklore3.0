import {Component, inject, OnInit} from '@angular/core';
import {DynamicDialogRef} from 'primeng/dynamicdialog';
import {Button} from 'primeng/button';
import {InputText} from 'primeng/inputtext';
import {FormsModule} from '@angular/forms';
import {BookService} from '../../service/book.service';
import {LocalStorageService} from '../../../../shared/service/local-storage.service';
import {MessageService} from 'primeng/api';
import {BookDialogHelperService} from '../book-browser/book-dialog-helper.service';
import {catchError, finalize, map, of} from 'rxjs';

type RenameRecord = {from: string; to: string};

@Component({
  selector: 'app-media-type-manager',
  standalone: true,
  imports: [Button, InputText, FormsModule],
  templateUrl: './media-type-manager.component.html',
  styleUrl: './media-type-manager.component.scss'
})
export class MediaTypeManagerComponent implements OnInit {
  private dynamicDialogRef = inject(DynamicDialogRef);
  private bookService = inject(BookService);
  private localStorageService = inject(LocalStorageService);
  private messageService = inject(MessageService);
  private bookDialogHelperService = inject(BookDialogHelperService);

  private readonly customMediaTypesKey = 'customMediaTypes';
  private readonly legacyBookTypesKey = 'customBookTypes';

  mediaTypes: string[] = [];
  editingType: string | null = null;
  editingValue = '';
  busyType: string | null = null;
  changed = false;
  renamed: RenameRecord[] = [];
  deleted: string[] = [];

  ngOnInit(): void {
    this.mediaTypes = this.getAllDisplayTypes();
  }

  close(): void {
    if (!this.changed) {
      this.dynamicDialogRef.close(false);
      return;
    }

    this.dynamicDialogRef.close({
      changed: true,
      renamed: this.renamed,
      deleted: this.deleted,
    });
  }

  startEdit(mediaType: string): void {
    this.editingType = mediaType;
    this.editingValue = mediaType;
  }

  cancelEdit(): void {
    this.editingType = null;
    this.editingValue = '';
  }

  saveEdit(): void {
    if (!this.editingType || this.busyType) {
      return;
    }

    const current = this.editingType;
    const next = this.editingValue.trim();
    if (!next || next === current) {
      this.cancelEdit();
      return;
    }

    const existing = this.getAllDisplayTypes();
    if (existing.some(type => type.toLowerCase() === next.toLowerCase() && type.toLowerCase() !== current.toLowerCase())) {
      this.messageService.add({severity: 'warn', summary: 'Media Type exists', detail: 'That Media Type already exists.'});
      return;
    }

    this.busyType = current;
    this.renameMediaType(current, next).pipe(finalize(() => this.busyType = null)).subscribe(success => {
      if (!success) {
        return;
      }

      this.changed = true;
      this.renamed.push({from: current, to: next});
      this.mediaTypes = this.getAllDisplayTypes();
      this.cancelEdit();
      this.messageService.add({severity: 'success', summary: 'Success', detail: 'Media Type renamed.'});
    });
  }

  requestDelete(mediaType: string): void {
    if (this.busyType) {
      return;
    }

    const dialogRef = this.bookDialogHelperService.openMediaTypeDeleteDialog(mediaType, this.getUsageCount(mediaType));
    dialogRef.onClose.subscribe((result: {confirmed?: boolean} | boolean) => {
      const confirmed = typeof result === 'boolean' ? result : !!result?.confirmed;
      if (!confirmed) {
        return;
      }
      this.executeDelete(mediaType);
    });
  }

  private executeDelete(mediaType: string): void {
    this.busyType = mediaType;
    this.deleteMediaType(mediaType).pipe(finalize(() => this.busyType = null)).subscribe(success => {
      if (!success) {
        return;
      }

      this.changed = true;
      this.deleted.push(mediaType);
      if (this.editingType?.toLowerCase() === mediaType.toLowerCase()) {
        this.cancelEdit();
      }
      this.mediaTypes = this.getAllDisplayTypes();
      this.messageService.add({severity: 'success', summary: 'Success', detail: 'Media Type deleted.'});
    });
  }

  private renameMediaType(current: string, next: string) {
    const updated = this.getStoredMediaTypes().map(type => type.toLowerCase() === current.toLowerCase() ? next : type);
    this.setStoredMediaTypes([...new Set(updated)].sort((a, b) => a.localeCompare(b)));

    const ids = new Set((this.bookService.getCurrentBookState().books ?? [])
      .filter(book => (book.fileType ?? '').trim().toLowerCase() === current.toLowerCase())
      .map(book => book.id));

    if (!ids.size) {
      return of(true);
    }

    return this.bookService.updateFileType(ids, next).pipe(
      map(() => true),
      catchError(() => {
        this.messageService.add({severity: 'error', summary: 'Error', detail: 'Failed to rename Media Type.'});
        return of(false);
      })
    );
  }

  private deleteMediaType(mediaType: string) {
    const updated = this.getStoredMediaTypes().filter(type => type.toLowerCase() !== mediaType.toLowerCase());
    this.setStoredMediaTypes(updated);

    const ids = new Set((this.bookService.getCurrentBookState().books ?? [])
      .filter(book => (book.fileType ?? '').trim().toLowerCase() === mediaType.toLowerCase())
      .map(book => book.id));

    if (!ids.size) {
      return of(true);
    }

    return this.bookService.updateFileType(ids, null).pipe(
      map(() => true),
      catchError(() => {
        this.messageService.add({severity: 'error', summary: 'Error', detail: 'Failed to delete Media Type.'});
        return of(false);
      })
    );
  }

  private getUsageCount(mediaType: string): number {
    return (this.bookService.getCurrentBookState().books ?? [])
      .filter(book => (book.fileType ?? '').trim().toLowerCase() === mediaType.toLowerCase())
      .length;
  }

  private getAllDisplayTypes(): string[] {
    const stored = this.getStoredMediaTypes();
    const fromBooks = (this.bookService.getCurrentBookState().books ?? [])
      .map(b => (b.fileType ?? '').trim())
      .filter(t => !!t);
    return [...new Set([...stored, ...fromBooks])].sort((a, b) => a.localeCompare(b));
  }

  private getStoredMediaTypes(): string[] {
    const mediaTypes = this.localStorageService.get<string[]>(this.customMediaTypesKey) ?? [];
    const legacyBookTypes = this.localStorageService.get<string[]>(this.legacyBookTypesKey) ?? [];
    return [...new Set([...mediaTypes, ...legacyBookTypes])].sort((a, b) => a.localeCompare(b));
  }

  private setStoredMediaTypes(types: string[]): void {
    this.localStorageService.set(this.customMediaTypesKey, types);
    this.localStorageService.remove(this.legacyBookTypesKey);
  }
}