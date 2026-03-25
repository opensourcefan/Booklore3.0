export interface AiBulkScanResponse {
  started: boolean;
  totalEligibleBooks: number;
  missingBooks: number;
  alreadyScannedBooks: number;
  message: string;
}

export interface AiPanelScanProgressPayload {
  mode: 'BOOK' | 'BATCH' | string;
  event: 'STARTED' | 'BOOK_STARTED' | 'PAGE_SCANNED' | 'BOOK_COMPLETED' | 'COMPLETED' | 'FAILED' | string;
  bookId: number | null;
  bookTitle: string | null;
  processedPages: number | null;
  totalPages: number | null;
  panelsFound: number | null;
  pagesWithPanels: number | null;
  completedBooks: number | null;
  totalBooks: number | null;
  skippedBooks: number | null;
  message: string | null;
  error: string | null;
}