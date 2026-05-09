import {Injectable} from '@angular/core';
import {BehaviorSubject, Observable} from 'rxjs';
import {Book} from '../../model/book.model';

export interface CheckboxClickEvent {
  index: number;
  book: Book;
  selected: boolean;
  shiftKey: boolean;
}

@Injectable({providedIn: 'root'})
export class BookSelectionService {
  private selectedBooksSubject = new BehaviorSubject<Set<number>>(new Set());
  private currentBooks: Book[] = [];
  private lastSelectedIndex: number | null = null;

  selectedBooks$: Observable<Set<number>> = this.selectedBooksSubject.asObservable();

  get selectedBooks(): Set<number> {
    return new Set(this.selectedBooksSubject.value);
  }

  get selectedCount(): number {
    return this.selectedBooksSubject.value.size;
  }

  setCurrentBooks(books: Book[]): void {
    this.currentBooks = books;
  }

  getCurrentBooks(): Book[] {
    return this.currentBooks;
  }

  selectBook(book: Book): void {
    const current = new Set(this.selectedBooksSubject.value);
    if (book.seriesBooks) {
      book.seriesBooks.forEach(b => current.add(b.id));
    } else {
      current.add(book.id);
    }
    this.selectedBooksSubject.next(current);
  }

  deselectBook(book: Book): void {
    const current = new Set(this.selectedBooksSubject.value);
    if (book.seriesBooks) {
      book.seriesBooks.forEach(b => current.delete(b.id));
    } else {
      current.delete(book.id);
    }
    this.selectedBooksSubject.next(current);
  }

  handleCheckboxClick(event: CheckboxClickEvent): void {
    const {index, book, selected, shiftKey} = event;

    if (!shiftKey || this.lastSelectedIndex === null) {
      this.handleBookSelection(book, selected);
      this.lastSelectedIndex = index;
    } else {
      const start = Math.min(this.lastSelectedIndex, index);
      const end = Math.max(this.lastSelectedIndex, index);
      const isUnselectingRange = !selected;

      // Batch all range operations into a single emission
      // to avoid N separate emissions each triggering syncSelectionState + cdr.detectChanges()
      const current = new Set(this.selectedBooksSubject.value);
      for (let i = start; i <= end; i++) {
        const rangeBook = this.currentBooks[i];
        if (!rangeBook) continue;
        if (isUnselectingRange) {
          if (rangeBook.seriesBooks) {
            rangeBook.seriesBooks.forEach(b => current.delete(b.id));
          } else {
            current.delete(rangeBook.id);
          }
        } else {
          if (rangeBook.seriesBooks) {
            rangeBook.seriesBooks.forEach(b => current.add(b.id));
          } else {
            current.add(rangeBook.id);
          }
        }
      }
      this.selectedBooksSubject.next(current);
    }
  }

  handleBookSelection(book: Book, selected: boolean): void {
    if (selected) {
      this.selectBook(book);
    } else {
      this.deselectBook(book);
    }
  }

  selectAll(): void {
    if (!this.currentBooks || this.currentBooks.length === 0) return;

    this.selectedBooksSubject.next(new Set(this.currentBooks.map(b => b.id)));
  }

  deselectAll(): void {
    this.selectedBooksSubject.next(new Set());
    this.lastSelectedIndex = null;
  }

  setSelectedBooks(bookIds: Set<number>): void {
    this.selectedBooksSubject.next(new Set(bookIds));
  }

  hasSelection(): boolean {
    return this.selectedBooksSubject.value.size > 0;
  }
}
