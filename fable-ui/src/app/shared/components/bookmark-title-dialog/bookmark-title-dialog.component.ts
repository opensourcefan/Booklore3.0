import {Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {TranslocoPipe} from '@jsverse/transloco';
import {GhostClickGuard, shouldDismissOverlay} from '../../util/overlay-dismiss.util';

@Component({
  selector: 'app-bookmark-title-dialog',
  standalone: true,
  imports: [FormsModule, TranslocoPipe],
  templateUrl: './bookmark-title-dialog.component.html',
  styleUrl: './bookmark-title-dialog.component.scss',
})
export class BookmarkTitleDialogComponent implements OnChanges {
  @Input({required: true}) visible = false;
  @Input() title = '';
  @Input() placeholder = '';
  @Input() defaultTitle = '';

  @Output() titleChange = new EventEmitter<string>();
  @Output() save = new EventEmitter<string>();
  @Output() dismissed = new EventEmitter<void>();

  @ViewChild('titleInput') titleInput!: ElementRef<HTMLInputElement>;

  private readonly dismissGuard = new GhostClickGuard();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']?.currentValue === true) {
      this.dismissGuard.arm();
      setTimeout(() => this.titleInput?.nativeElement?.focus(), 0);
    }
  }

  onTitleInput(value: string): void {
    this.titleChange.emit(value);
  }

  onSave(): void {
    const resolved = this.title.trim() || this.defaultTitle.trim();
    this.save.emit(resolved);
  }

  onDismiss(): void {
    this.dismissed.emit();
  }

  onOverlayDismiss(event: Event): void {
    if (!shouldDismissOverlay(event, this.dismissGuard)) {
      return;
    }
    this.onDismiss();
  }
}
