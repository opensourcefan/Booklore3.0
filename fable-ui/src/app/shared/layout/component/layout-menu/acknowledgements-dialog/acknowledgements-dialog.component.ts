import {Component, inject} from '@angular/core';
import {DynamicDialogRef} from 'primeng/dynamicdialog';
import {environment} from '../../../../../../environments/environment';

@Component({
  selector: 'app-acknowledgements-dialog',
  standalone: true,
  template: `
    <div class="ack-dialog">
      <div class="ack-header">
        <div>
          <h2>Thanks to:</h2>
        </div>
        <button type="button" class="close-btn" (click)="close()" aria-label="Close">×</button>
      </div>

      <div class="ack-body">
        <p>Original developers and contributors of Booklore</p>
        <p>
          mosesb - best-comic-panel-detection
          <a href="https://huggingface.co/mosesb" target="_blank" rel="noopener noreferrer">https://huggingface.co/mosesb</a>
        </p>
        <p>Ultralytics for the YOLO model</p>
        <p>GitHub Copilot</p>
      </div>
    </div>
  `,
  styles: [`
    .ack-dialog {
      padding: 1.25rem;
      background: var(--surface-card);
      color: var(--text-color);
    }

    .ack-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .ack-header h2 {
      margin: 0;
      font-size: 1.2rem;
    }

    .close-btn {
      border: none;
      background: none;
      color: var(--text-color-secondary);
      font-size: 1.5rem;
      line-height: 1;
      cursor: pointer;
      padding: 0;
    }

    .ack-body {
      display: grid;
      gap: 0.85rem;
      line-height: 1.5;
    }

    .ack-body p {
      margin: 0;
    }

    .ack-body a {
      color: var(--primary-color);
      word-break: break-word;
    }
  `]
})
export class AcknowledgementsDialogComponent {
  private readonly dialogRef = inject(DynamicDialogRef);
  protected readonly appName = environment.appName || 'Fable';

  close(): void {
    this.dialogRef.close();
  }
}