import {ChangeDetectorRef, Component, OnDestroy, OnInit, inject} from '@angular/core';
import {Button} from 'primeng/button';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import {
  addFullscreenChangeListener,
  clearFullscreenTransientPointerUi,
  isAppFullscreen,
  toggleAppFullscreen
} from '../../util/fullscreen.util';

export interface KioskActionsSheetData {
  isFullscreen?: boolean;
}

@Component({
  selector: 'app-kiosk-actions-sheet',
  standalone: true,
  imports: [Button],
  template: `
    <div class="kiosk-actions-sheet">
      <p class="kiosk-actions-sheet__hint">Tablet / kiosk actions (not available in Phone Mode)</p>
      <div class="kiosk-actions-sheet__actions">
        <p-button
          styleClass="w-full"
          (onClick)="onToggleFullscreen()">
          <span class="kiosk-actions-sheet__btn-face">
            <i [class]="isFullscreen ? 'pi pi-window-minimize' : 'pi pi-window-maximize'" aria-hidden="true"></i>
            <span>{{ isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen' }}</span>
          </span>
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
    .kiosk-actions-sheet__btn-face {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      width: 100%;
    }
  `]
})
export class KioskActionsSheetComponent implements OnInit, OnDestroy {
  private readonly dialogRef = inject(DynamicDialogRef);
  private readonly dialogConfig = inject(DynamicDialogConfig);
  private readonly cdr = inject(ChangeDetectorRef);
  private removeFullscreenListener: (() => void) | null = null;

  isFullscreen = false;

  ngOnInit(): void {
    const data = (this.dialogConfig.data ?? {}) as KioskActionsSheetData;
    if (typeof data.isFullscreen === 'boolean') {
      this.isFullscreen = data.isFullscreen;
    }
    this.syncFullscreenFromBrowser();
    this.removeFullscreenListener = addFullscreenChangeListener(() => {
      this.syncFullscreenFromBrowser();
    });
  }

  ngOnDestroy(): void {
    this.removeFullscreenListener?.();
    this.removeFullscreenListener = null;
  }

  onToggleFullscreen(): void {
    // Keep the user-activation gesture; close after the Fullscreen API settles
    // so Chromium (esp. Wayland/kiosk) does not drop the request.
    void toggleAppFullscreen().finally(() => {
      clearFullscreenTransientPointerUi();
      this.syncFullscreenFromBrowser();
      this.close();
    });
  }

  onReload(): void {
    this.close();
    window.location.reload();
  }

  close(): void {
    this.dialogRef.close();
  }

  private syncFullscreenFromBrowser(): void {
    this.isFullscreen = isAppFullscreen();
    this.cdr.markForCheck();
  }
}
