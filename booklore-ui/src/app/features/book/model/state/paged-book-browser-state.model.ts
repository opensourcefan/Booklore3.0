import {Book} from '../book.model';

export type BookBrowserDataSourceMode = 'legacy-full-state' | 'paged-browse';
export type PagedBookBrowserEntity = 'ALL_BOOKS' | 'LIBRARY';
export type BookBrowserViewMode = 'grid' | 'table';
export type PagedBookBrowserStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface PagedBookBrowserRequestKey {
  entity: PagedBookBrowserEntity;
  entityId: number | null;
  viewMode: BookBrowserViewMode;
  page: number;
  size: number;
  sorts: string[];
  filterMode: string;
  search: string | null;
  filters: Record<string, string[]>;
}

export interface PagedBookBrowserPage {
  content: Book[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

export interface PagedBookBrowserCacheEntry {
  key: PagedBookBrowserRequestKey;
  status: PagedBookBrowserStatus;
  page: PagedBookBrowserPage | null;
  error: string | null;
  loadedAt: number | null;
  fallbackReason: string | null;
}

export interface BookBrowserRolloutGuardrails {
  activeMode: BookBrowserDataSourceMode;
  fallbackMode: 'legacy-full-state';
  allowPagedGridView: boolean;
  allowPagedTableView: boolean;
  enabledEntities: PagedBookBrowserEntity[];
}

export const DEFAULT_BOOK_BROWSER_ROLLOUT_GUARDRAILS: Readonly<BookBrowserRolloutGuardrails> = Object.freeze({
  activeMode: 'legacy-full-state',
  fallbackMode: 'legacy-full-state',
  allowPagedGridView: false,
  allowPagedTableView: false,
  enabledEntities: [],
});