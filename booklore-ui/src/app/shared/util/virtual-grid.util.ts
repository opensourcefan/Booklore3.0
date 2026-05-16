import {computed, Signal, signal} from '@angular/core';
import {injectVirtualizer} from '@tanstack/angular-virtual';
import type {AngularVirtualizer} from '@tanstack/angular-virtual';

/**
 * Reactive row-based virtual grid utility for TanStack Virtual.
 *
 * Groups items into rows based on column count, then virtualizes by row.
 * All rows use a uniform height estimate.
 *
 * The `options` factory is called inside computed contexts, so any signal
 * reads inside it are tracked for automatic re-evaluation.
 */
export interface VirtualGridOptions {
  /** Total number of items */
  itemCount: number;
  /** Width of a single card in pixels */
  cardWidth: number;
  /** Uniform row height in pixels (card height + gap) */
  cardHeight: number;
  /** Gap between cards in pixels */
  gap: number;
  /** Number of extra rows to overscan */
  overscan?: number;
}

export interface VirtualGridResult {
  /** The virtualizer instance */
  virtualizer: AngularVirtualizer<HTMLElement, HTMLElement>;
  /** Current column count (signal) */
  columnCount: Signal<number>;
  /** Current number of rows (signal) */
  rowCount: Signal<number>;
  /** Current row height including gap (signal) */
  rowHeight: Signal<number>;
  /** Get items for a given row index */
  getRowItems: <T>(rowIndex: number, allItems: T[]) => T[];
  /** Set the scroll container element (call in ngAfterViewInit) */
  setScrollElement: (el: HTMLElement | null) => void;
  /** Set the container width (call on resize / after view init) */
  setContainerWidth: (width: number) => void;
}

/**
 * Injects a row-based virtualizer for a grid layout.
 *
 * Call `setScrollElement()` in ngAfterViewInit and `setContainerWidth()`
 * on resize to connect to the DOM.
 */
export function injectVirtualGrid(
  optionsFactory: () => VirtualGridOptions
): VirtualGridResult {
  const scrollElementRef = signal<HTMLElement | null>(null);
  const containerWidth = signal(0);

  let resizeDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  const columnCount = computed(() => {
    const {cardWidth, gap} = optionsFactory();
    const width = containerWidth();
    if (width <= 0) return 1;
    const totalCardSpace = cardWidth + gap;
    return Math.max(1, Math.floor((width + gap) / totalCardSpace));
  });

  const rowCount = computed(() => {
    const {itemCount} = optionsFactory();
    const cols = columnCount();
    return Math.ceil(itemCount / cols);
  });

  const rowHeight = computed(() => {
    const {cardHeight, gap} = optionsFactory();
    return cardHeight + gap;
  });

  const virtualizer: AngularVirtualizer<HTMLElement, HTMLElement> = injectVirtualizer(() => {
    const opts = optionsFactory();
    return {
      count: rowCount(),
      estimateSize: () => rowHeight(),
      overscan: opts.overscan ?? 5,
      scrollElement: scrollElementRef() ?? undefined,
    };
  });

  function getRowItems<T>(rowIndex: number, allItems: T[]): T[] {
    const cols = columnCount();
    const start = rowIndex * cols;
    const end = Math.min(start + cols, allItems.length);
    return allItems.slice(start, end);
  }

  function setScrollElement(el: HTMLElement | null): void {
    scrollElementRef.set(el);
  }

  function setContainerWidth(width: number): void {
    if (resizeDebounceTimer) {
      clearTimeout(resizeDebounceTimer);
    }
    resizeDebounceTimer = setTimeout(() => {
      containerWidth.set(width);
    }, 100);
  }

  return {
    virtualizer,
    columnCount,
    rowCount,
    rowHeight,
    getRowItems,
    setScrollElement,
    setContainerWidth,
  };
}
