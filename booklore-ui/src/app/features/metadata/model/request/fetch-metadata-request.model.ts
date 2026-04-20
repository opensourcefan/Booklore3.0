export interface FetchMetadataRequest {
  bookId: number,
  providers: string[],
  title: string,
  author: string,
  isbn: string,
  sourceUrl?: string,
  issueNumber?: string,
  issueRange?: string
}
