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

  private readonly customBookTypesKey = 'customBookTypes';

  bookTypeName = '';

  cancel(): void {
    this.dynamicDialogRef.close(false);
  }

  createBookType(): void {
    const candidate = this.bookTypeName.trim();
    if (!candidate) {
      return;
    }

    const existing = this.localStorageService.get<string[]>(this.customBookTypesKey) ?? [];
    if (existing.some(type => type.toLowerCase() === candidate.toLowerCase())) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Book Type exists',
        detail: 'That Book Type label already exists.'
      });
      return;
    }

    const updated = [...existing, candidate].sort((a, b) => a.localeCompare(b));
    this.localStorageService.set(this.customBookTypesKey, updated);

    this.messageService.add({
      severity: 'info',
      summary: 'Success',
      detail: `Created Book Type "${candidate}".`
    });

    this.dynamicDialogRef.close({created: true, type: candidate});
  }
}
