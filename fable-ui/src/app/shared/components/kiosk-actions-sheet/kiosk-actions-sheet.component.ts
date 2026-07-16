import {Component, inject} from '@angular/core';
import {Button} from 'primeng/button';
import {DynamicDialogRef} from 'primeng/dynamicdialog';
import {getFullscreenElement, toggleAppFullscreen} from '../../util/fullscreen.util';

@Component({
  selector: 'app-kiosk-actions-sheet',
  standalone: true,
  imports: [Button],
  template: `
    <div class="kiosk-actions-sheet">
      <p class="kiosk-actions-sheet__hint">Tablet / kiosk actions (not available in Phone Mode)</p>
      <div class="kiosk-actions-sheet__actions">
        <p-button
          [label]="isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'"
          [icon]="isFullscreen ? 'pi pi-window-minimize' : 'pi pi-window-maximize'"
          styleClass="w-full"
          (onClick)="onToggleFullscreen()">
        </p-button>
        <p-button
          label="Reload app"
          icon="pi pi-refresh"
          severity="secondary"
          styleClass="w-full"
          (onClick)="onReload()">
        </p-button>
        <p-button
          label="Close"
          icon="pi pi-times"
          severity="secondary"
          [text]="true"
          styleClass="w-full"
          (onClick)="close()">
        </p-button>
      </div>
    </div>
  `,
  styles: [`
    .kiosk-actions-sheet {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding: 0.25rem 0;
      min-width: min(18rem, 100%);
    }
    .kiosk-actions-sheet__hint {
      margin: 0;
      font-size: 0.85rem;
      opacity: 0.75;
    }
    .kiosk-actions-sheet__actions {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
  `]
})
export class KioskActionsSheetComponent {
  private readonly dialogRef = inject(DynamicDialogRef);

  get isFullscreen(): boolean {
    return !!getFullscreenElement();
  }

  onToggleFullscreen(): void {
    void toggleAppFullscreen().finally(() => this.close());
  }

  onReload(): void {
    this.close();
    window.location.reload();
  }

  close(): void {
    this.dialogRef.close();
  }
}
