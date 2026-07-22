import {BookMark} from '../service/book-mark.service';

/** Oldest → newest by createdAt (stable for equal timestamps). */
export function sortBookmarksChronological(bookmarks: BookMark[]): BookMark[] {
  return [...bookmarks].sort((a, b) => {
    const aTime = Date.parse(a.createdAt || '') || 0;
    const bTime = Date.parse(b.createdAt || '') || 0;
    if (aTime !== bTime) {
      return aTime - bTime;
    }
    return (a.id || 0) - (b.id || 0);
  });
}
