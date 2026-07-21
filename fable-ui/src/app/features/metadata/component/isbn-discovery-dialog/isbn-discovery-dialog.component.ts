import {Component, inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {TranslocoDirective} from '@jsverse/transloco';
import {Button} from 'primeng/button';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import {MultiSelect} from 'primeng/multiselect';

export interface IsbnDiscoveryDialogData {
  count: number;
  providers: string[];
}

@Component({
  selector: 'app-isbn-discovery-dialog',
  standalone: true,
  imports: [Button, FormsModule, MultiSelect, TranslocoDirective],
  templateUrl: './isbn-discovery-dialog.component.html',
  styleUrl: './isbn-discovery-dialog.component.scss',
})
export class IsbnDiscoveryDialogComponent {
  private static readonly STORAGE_KEY = 'fable-isbn-discovery-providers';

  private readonly config = inject(DynamicDialogConfig<IsbnDiscoveryDialogData>);
  private readonly dialogRef = inject(DynamicDialogRef);

  readonly count = this.config.data?.count ?? 0;
  readonly providers = this.config.data?.providers ?? [];
  selectedProviders = this.loadSelection();

  get canConfirm(): boolean {
    return this.selectedProviders.length > 0;
  }

  confirm(): void {
    if (!this.canConfirm) {
      return;
    }
    localStorage.setItem(
      IsbnDiscoveryDialogComponent.STORAGE_KEY,
      JSON.stringify(this.selectedProviders)
    );
    this.dialogRef.close([...this.selectedProviders]);
  }

  cancel(): void {
    this.dialogRef.close();
  }

  private loadSelection(): string[] {
    const stored = localStorage.getItem(IsbnDiscoveryDialogComponent.STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter(
            (provider): provider is string =>
              typeof provider === 'string' && this.providers.includes(provider)
          );
          if (valid.length > 0) {
            return valid;
          }
        }
      } catch {
        // Ignore malformed local preferences and use enabled providers.
      }
    }
    return [...this.providers];
  }
}
