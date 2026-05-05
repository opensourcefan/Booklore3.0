import {Book} from '../book.model';
import {PagedBookBrowserCacheEntry} from './paged-book-browser-state.model';

export interface BookState {
  books: Book[] | null;
  loaded: boolean;
  error: string | null;
  totalCount?: number | null;
  pagedCache?: Record<string, PagedBookBrowserCacheEntry>;
}
