import {ChangeDetectionStrategy, Component, ElementRef, EventEmitter, inject, Input, Output} from '@angular/core';
import {SortDirection, SortOption} from '../../../../model/sort.model';
import {CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray} from '@angular/cdk/drag-drop';
import {Select} from 'primeng/select';
import {FormsModule} from '@angular/forms';
import {Tooltip} from 'primeng/tooltip';
import {Button} from 'primeng/button';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {Popover} from 'primeng/popover';

@Component({
  selector: 'app-multi-sort-popover',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    Select,
    FormsModule,
    Tooltip,
    Button,
    TranslocoDirective
  ],
  templateUrl: './multi-sort-popover.component.html',
  styleUrl: './multi-sort-popover.component.scss'
})
export class MultiSortPopoverComponent {
  private readonly t = inject(TranslocoService);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly popover = inject(Popover, {optional: true});
  @Input() sortCriteria: SortOption[] = [];
  @Input() availableSortOptions: SortOption[] = [];
  @Input() showSaveButton = false;
  @Input() closeOnFocusOut = false;

  @Output() criteriaChange = new EventEmitter<SortOption[]>();
  @Output() saveSortConfig = new EventEmitter<SortOption[]>();

  selectedField: string | null = null;

  get unusedOptions(): SortOption[] {
    const usedFields = new Set(this.sortCriteria.map(c => c.field));
    return this.availableSortOptions.filter(opt => !usedFields.has(opt.field));
  }

  onDrop(event: CdkDragDrop<SortOption[]>): void {
    const criteria = [...this.sortCriteria];
    moveItemInArray(criteria, event.previousIndex, event.currentIndex);
    this.sortCriteria = criteria;
    this.criteriaChange.emit(this.sortCriteria);
  }

  onToggleDirection(index: number): void {
    this.sortCriteria = this.sortCriteria.map((c, i) =>
      i === index
        ? {...c, direction: c.direction === SortDirection.ASCENDING ? SortDirection.DESCENDING : SortDirection.ASCENDING}
        : c
    );
    this.criteriaChange.emit(this.sortCriteria);
  }

  onRemove(index: number): void {
    this.sortCriteria = this.sortCriteria.filter((_, i) => i !== index);
    this.criteriaChange.emit(this.sortCriteria);
  }

  onAddField(): void {
    if (!this.selectedField) return;
    const option = this.availableSortOptions.find(o => o.field === this.selectedField);
    if (!option) return;
    this.sortCriteria = [...this.sortCriteria, {
      label: option.label,
      field: option.field,
      direction: SortDirection.ASCENDING
    }];
    this.selectedField = null;
    this.criteriaChange.emit(this.sortCriteria);
  }

  onSave(): void {
    this.saveSortConfig.emit(this.sortCriteria);
    this.closePopover();
  }

  onContainerFocusOut(event: FocusEvent): void {
    if (!this.closeOnFocusOut) {
      return;
    }

    queueMicrotask(() => {
      const nextFocusTarget = event.relatedTarget ?? this.elementRef.nativeElement.ownerDocument.activeElement;
      if (this.shouldKeepPopoverOpen(nextFocusTarget)) {
        return;
      }

      this.closePopover();
    });
  }

  getDirectionIcon(direction: SortDirection): string {
    return direction === SortDirection.ASCENDING ? 'pi pi-arrow-up' : 'pi pi-arrow-down';
  }

  getDirectionTooltip(direction: SortDirection): string {
    return direction === SortDirection.ASCENDING
      ? this.t.translate('book.sorting.ascendingTooltip')
      : this.t.translate('book.sorting.descendingTooltip');
  }

  private shouldKeepPopoverOpen(target: EventTarget | null): boolean {
    const element = target instanceof Element ? target : null;

    if (!element) {
      return false;
    }

    return this.elementRef.nativeElement.contains(element)
      || !!element.closest('.p-select-overlay');
  }

  private closePopover(): void {
    this.popover?.hide();
  }

  protected readonly SortDirection = SortDirection;
}
