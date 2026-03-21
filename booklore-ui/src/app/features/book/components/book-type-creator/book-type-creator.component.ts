import {Component, inject} from '@angular/core';
import {DynamicDialogRef} from 'primeng/dynamicdialog';
import {MessageService} from 'primeng/api';
import {FormsModule} from '@angular/forms';
import {Button} from 'primeng/button';
import {InputText} from 'primeng/inputtext';
import {LocalStorageService} from '../../../../shared/service/local-storage.service';

@Component({
  selector: 'app-book-type-creator',
  standalone: true,
  templateUrl: './book-type-creator.component.html',
  styleUrl: './book-type-creator.component.scss',
  imports: [
    FormsModule,
    Button,
    InputText,
  ],
})
export class BookTypeCreatorComponent {
  private dynamicDialogRef = inject(DynamicDialogRef);
  private messageService = inject(MessageService);
  private localStorageService = inject(LocalStorageService);

  private readonly customMediaTypesKey = 'customMediaTypes';

  mediaTypeName = '';

  cancel(): void {
    this.dynamicDialogRef.close(false);
  }

  createBookType(): void {
    const candidate = this.mediaTypeName.trim();
    if (!candidate) {
      return;
    }

    const existing = this.localStorageService.get<string[]>(this.customMediaTypesKey)
      ?? this.localStorageService.get<string[]>('customBookTypes')
      ?? [];
    if (existing.some(type => type.toLowerCase() === candidate.toLowerCase())) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Media Type exists',
        detail: 'That Media Type label already exists.'
      });
      return;
    }

    const updated = [...existing, candidate].sort((a, b) => a.localeCompare(b));
    this.localStorageService.set(this.customMediaTypesKey, updated);
    this.localStorageService.remove('customBookTypes');

    this.messageService.add({
      severity: 'info',
      summary: 'Success',
      detail: `Created Media Type "${candidate}".`
    });

    this.dynamicDialogRef.close({created: true, type: candidate});
  }
}
