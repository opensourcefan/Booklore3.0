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
}

export interface StoryArcMetadataDto {
  externalUrl?: string;
  scrapedTitle?: string;
  scrapedDescription?: string;
}
