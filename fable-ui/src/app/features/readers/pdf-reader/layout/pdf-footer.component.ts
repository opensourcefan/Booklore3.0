import {Component, EventEmitter, Input, Output} from '@angular/core';
import {TranslocoPipe} from '@jsverse/transloco';
import {ReaderIconComponent} from '../../ebook-reader/shared/icon.component';

@Component({
  selector: 'app-pdf-footer',
  standalone: true,
  imports: [TranslocoPipe, ReaderIconComponent],
  templateUrl: './pdf-footer.component.html',
  styleUrl: './pdf-footer.component.scss',
})
export class PdfFooterComponent {
  @Input() visible = false;
  @Input() currentPage = 1;
  @Input() totalPages = 0;

  @Output() previousPage = new EventEmitter<void>();
  @Output() nextPage = new EventEmitter<void>();
  @Output() firstPage = new EventEmitter<void>();
  @Output() lastPage = new EventEmitter<void>();

  get canGoPrevious(): boolean {
    return this.currentPage > 1;
  }

  get canGoNext(): boolean {
    return this.totalPages > 0 && this.currentPage < this.totalPages;
  }
}
