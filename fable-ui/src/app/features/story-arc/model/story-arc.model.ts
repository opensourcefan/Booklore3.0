import { Book } from '../../book/model/book.model';

export interface StoryArcSummary {
  storyArcName: string;
  bookCount: number;
  readBookCount: number;
  completionPercent: number;
  coverBookId?: number;
}

export interface StoryArcBookMapping {
  id?: number;
  storyArcName: string;
  bookId: number;
  rowIndex: number;
  colIndex: number;
  sequenceOrder: number;
  isCore: boolean;
  rowTitle?: string;
  externalUrl?: string;
  description?: string;
  coverBookId?: number;
  book?: Book;
}

export interface StoryArcLayoutUpdateRequest {
  storyArcName: string;
  externalUrl?: string;
  description?: string;
  items: StoryArcLayoutItem[];
}

export interface StoryArcLayoutItem {
  bookId: number;
  rowIndex: number;
  colIndex: number;
  sequenceOrder: number;
  isCore: boolean;
  rowTitle?: string;
  externalUrl?: string;
  description?: string;
}

export interface StoryArcBulkAddRequest {
  storyArcName: string;
  bookIds: number[];
  /** Optional: target row index for chapter placement. If null, appends to last row. */
  targetRowIndex?: number;
  /** Optional: row title when creating a new chapter via targetRowIndex. */
  rowTitle?: string;
  /** Optional: if true, group books by their series metadata into separate chapters. */
  groupBySeries?: boolean;
}

export interface StoryArcMetadataDto {
  externalUrl?: string;
  scrapedTitle?: string;
  scrapedDescription?: string;
}
