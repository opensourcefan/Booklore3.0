import {GroupRule} from '../component/magic-shelf-component';

export interface ShelfTemplate {
  id: string;
  name: string;
  description: string;
  category: ShelfTemplateCategory;
  tags: string[];
  group: GroupRule;
}

export type ShelfTemplateCategory =
  | 'reading'
  | 'genre'
  | 'ratings'
  | 'series'
  | 'maintenance'
  | 'dates'
  | 'author'
  | 'files'
  | 'audiobooks'
  | 'advanced';

export const SHELF_TEMPLATE_CATEGORIES: { key: ShelfTemplateCategory; labelKey: string }[] = [
  {key: 'reading', labelKey: 'readingProgress'},
  {key: 'genre', labelKey: 'genreTheme'},
  {key: 'ratings', labelKey: 'ratingsPopularity'},
  {key: 'series', labelKey: 'seriesCollections'},
  {key: 'maintenance', labelKey: 'libraryMaintenance'},
  {key: 'dates', labelKey: 'dateBased'},
  {key: 'author', labelKey: 'authorPublisher'},
  {key: 'files', labelKey: 'fileFormat'},
  {key: 'audiobooks', labelKey: 'audiobooks'},
  {key: 'advanced', labelKey: 'powerUser'},
];

export const SHELF_TEMPLATES: ShelfTemplate[] = [
  // ===== READING PROGRESS =====
  {
    id: 'active-reads',
    name: 'Your Active Reads',
    description: 'Every book you\'re currently in the middle of, whether it\'s a first read or a revisit. Keeps your nightstand visible at a glance.',
    category: 'reading',
    tags: ['readStatus', 'equals'],
    group: {type: 'group', join: 'or', rules: [{field: 'readStatus', operator: 'equals', value: 'READING'}, {field: 'readStatus', operator: 'equals', value: 'RE_READING'}]}
  },
  {
    id: 'waiting-to-read',
    name: 'Books Waiting to Be Read',
    description: 'Your full to-be-read pile. Every unread book in your library, all in one place.',
    category: 'reading',
    tags: ['readStatus', 'equals'],
    group: {type: 'group', join: 'and', rules: [{field: 'readStatus', operator: 'equals', value: 'UNREAD'}]}
  },
  {
    id: 'finished-this-year',
    name: 'Completed This Year',
    description: 'Every book you\'ve finished since January 1st. A running tally of your annual reading progress.',
    category: 'reading',
    tags: ['dateFinished', 'this_period'],
    group: {type: 'group', join: 'and', rules: [{field: 'dateFinished', operator: 'this_period', value: 'year'}]}
  },
  {
    id: 'finished-last-30-days',
    name: 'Recently Finished',
    description: 'Books you\'ve completed in the last 30 days. Great for tracking your reading pace and sharing recent recommendations.',
    category: 'reading',
    tags: ['dateFinished', 'within_last'],
    group: {type: 'group', join: 'and', rules: [{field: 'dateFinished', operator: 'within_last', value: 30, valueEnd: 'days'}]}
  },
  {
    id: 'stalled-reads',
    name: 'Books You Haven\'t Touched in a Month',
    description: 'Books you started but haven\'t opened in over 30 days. A gentle nudge to either pick them back up or move on.',
    category: 'reading',
    tags: ['readStatus', 'lastReadTime', 'older_than'],
    group: {type: 'group', join: 'and', rules: [{field: 'readStatus', operator: 'equals', value: 'READING'}, {field: 'lastReadTime', operator: 'older_than', value: 30, valueEnd: 'days'}]}
  },
  {
    id: 'abandoned-dnf',
    name: 'Abandoned & Did Not Finish',
    description: 'Books you decided not to finish. Tracking these helps you avoid re-adding the same disappointments later.',
    category: 'reading',
    tags: ['readStatus', 'equals'],
    group: {type: 'group', join: 'or', rules: [{field: 'readStatus', operator: 'equals', value: 'ABANDONED'}, {field: 'readStatus', operator: 'equals', value: 'WONT_READ'}]}
  },
  {
    id: 'almost-done',
    name: 'Almost Finished (75% or More)',
    description: 'Books where you\'re at 75% progress or more but haven\'t crossed the finish line. One good session away from done.',
    category: 'reading',
    tags: ['readingProgress', 'greater_than_equal_to', 'not_equals'],
    group: {type: 'group', join: 'and', rules: [{field: 'readingProgress', operator: 'greater_than_equal_to', value: 75}, {field: 'readStatus', operator: 'not_equals', value: 'READ'}]}
  },
  {
    id: 'short-quick-reads',
    name: 'Short Books You Can Finish Fast',
    description: 'Unread books under 200 pages. Perfect for reading slumps or when you need a quick win.',
    category: 'reading',
    tags: ['readStatus', 'pageCount', 'less_than'],
    group: {type: 'group', join: 'and', rules: [{field: 'readStatus', operator: 'equals', value: 'UNREAD'}, {field: 'pageCount', operator: 'less_than', value: 200}, {field: 'pageCount', operator: 'greater_than', value: 0}]}
  },
  {
    id: 'favorites-reread',
    name: 'Favorites Worth Reading Again',
    description: 'Books you rated 9 or 10 out of 10. When you want a guaranteed great read, pick from this shelf.',
    category: 'reading',
    tags: ['readStatus', 'personalRating', 'greater_than_equal_to'],
    group: {type: 'group', join: 'and', rules: [{field: 'readStatus', operator: 'equals', value: 'READ'}, {field: 'personalRating', operator: 'greater_than_equal_to', value: 9}]}
  },
  {
    id: 'half-read-limbo',
    name: 'Stuck in the Middle (25–75%)',
    description: 'Books between 25% and 75% progress. You\'ve invested time but aren\'t close to the end yet. Time to decide: finish or move on?',
    category: 'reading',
    tags: ['readingProgress', 'in_between', 'not_equals'],
    group: {type: 'group', join: 'and', rules: [{field: 'readingProgress', operator: 'in_between', valueStart: 25, valueEnd: 75}, {field: 'readStatus', operator: 'not_equals', value: 'READ'}]}
  },

  // ===== GENRE & THEME =====
  {
    id: 'dark-scholarly',
    name: 'Dark & Scholarly Fiction',
    description: 'Gothic and literary fiction with dark, atmospheric, mysterious moods. Think ivy-covered colleges and morally complex characters.',
    category: 'genre',
    tags: ['categories', 'moods', 'includes_any'],
    group: {type: 'group', join: 'and', rules: [{field: 'categories', operator: 'includes_any', value: ['Gothic Fiction', 'Literary Fiction', 'Dark Academia']}, {field: 'moods', operator: 'includes_any', value: ['Dark', 'Atmospheric', 'Mysterious']}]}
  },
  {
    id: 'cozy-mystery',
    name: 'Light & Cozy Mystery Reads',
    description: 'Mystery and crime books with cozy, light, heartwarming moods. All the puzzle-solving fun without the gritty darkness.',
    category: 'genre',
    tags: ['categories', 'moods', 'includes_any'],
    group: {type: 'group', join: 'and', rules: [{field: 'categories', operator: 'includes_any', value: ['Mystery', 'Cozy Mystery', 'Crime']}, {field: 'moods', operator: 'includes_any', value: ['Cozy', 'Light', 'Heartwarming']}]}
  },
  {
    id: 'epic-fantasy-big',
    name: 'Massive Fantasy Epics (500+ Pages)',
    description: 'Fantasy novels over 500 pages with sprawling worlds and complex magic systems. The kind of books that demand weeks of your attention.',
    category: 'genre',
    tags: ['categories', 'pageCount', 'greater_than'],
    group: {type: 'group', join: 'and', rules: [{field: 'categories', operator: 'includes_any', value: ['Fantasy', 'Epic Fantasy', 'High Fantasy']}, {field: 'pageCount', operator: 'greater_than', value: 500}]}
  },
  {
    id: 'romantic-suspense',
    name: 'Romance Meets Suspense',
    description: 'Books that blend romance with thriller, suspense, or mystery. Heart-racing tension and heart-fluttering romance in one package.',
    category: 'genre',
    tags: ['categories', 'includes_any'],
    group: {type: 'group', join: 'and', rules: [{field: 'categories', operator: 'includes_any', value: ['Romance', 'Romantic Suspense']}, {field: 'categories', operator: 'includes_any', value: ['Thriller', 'Suspense', 'Mystery']}]}
  },
  {
    id: 'hard-sci-fi',
    name: 'Science-Driven Sci-Fi',
    description: 'Science fiction that takes the science seriously. Scans descriptions for physics, quantum, space, and relativity keywords alongside sci-fi categories.',
    category: 'genre',
    tags: ['categories', 'description', 'contains', 'includes_any'],
    group: {type: 'group', join: 'and', rules: [{field: 'categories', operator: 'includes_any', value: ['Science Fiction', 'Hard Science Fiction']}, {type: 'group', join: 'or', rules: [{field: 'description', operator: 'contains', value: 'physics'}, {field: 'description', operator: 'contains', value: 'quantum'}, {field: 'description', operator: 'contains', value: 'space'}, {field: 'description', operator: 'contains', value: 'relativity'}]}]}
  },
  {
    id: 'true-crime',
    name: 'True Crime Collection',
    description: 'Real-world crime stories: investigations, serial killers, courtroom dramas, cold cases, and forensic deep dives.',
    category: 'genre',
    tags: ['categories', 'includes_any'],
    group: {type: 'group', join: 'and', rules: [{field: 'categories', operator: 'includes_any', value: ['True Crime', 'Crime', 'Criminology']}]}
  },
  {
    id: 'philosophy-self-help',
    name: 'Philosophy & Personal Growth',
    description: 'Books for the mind and soul. Philosophy, psychology, self-help, and personal development all in one shelf.',
    category: 'genre',
    tags: ['categories', 'includes_any'],
    group: {type: 'group', join: 'and', rules: [{field: 'categories', operator: 'includes_any', value: ['Philosophy', 'Self-Help', 'Psychology', 'Personal Development', 'Mindfulness']}]}
  },
  {
    id: 'horror-supernatural',
    name: 'Horror & Supernatural',
    description: 'Ghosts, monsters, cursed objects, and things that go bump in the night. Casts a wide net across horror sub-genres.',
    category: 'genre',
    tags: ['categories', 'includes_any'],
    group: {type: 'group', join: 'and', rules: [{field: 'categories', operator: 'includes_any', value: ['Horror', 'Supernatural', 'Gothic', 'Ghost Stories', 'Paranormal']}]}
  },
  {
    id: 'kids-ya',
    name: 'Kids & Young Adult',
    description: 'Everything for younger readers: middle grade adventures, YA fiction, picture books, and coming-of-age stories.',
    category: 'genre',
    tags: ['categories', 'includes_any'],
    group: {type: 'group', join: 'and', rules: [{field: 'categories', operator: 'includes_any', value: ['Young Adult', "Children's", 'Middle Grade', 'Picture Books', 'Juvenile Fiction']}]}
  },
  {
    id: 'graphic-novels-comics',
    name: 'Graphic Novels & Comics',
    description: 'Visual storytelling in all forms. Catches both category-tagged graphic novels and comic book file formats (CBR, CBZ, CB7).',
    category: 'genre',
    tags: ['categories', 'fileType', 'includes_any'],
    group: {type: 'group', join: 'or', rules: [{field: 'categories', operator: 'includes_any', value: ['Graphic Novel', 'Comics', 'Manga', 'Comic Book']}, {field: 'fileType', operator: 'includes_any', value: ['CBR', 'CBZ', 'CB7']}]}
  },

  // ===== RATINGS & POPULARITY =====
  {
    id: 'hidden-gems',
    name: 'Hidden Gems (High Rated, Low Reviews)',
    description: 'Books rated 4+ stars but with fewer than 5,000 reviews. Genuine quality that hasn\'t hit the mainstream yet.',
    category: 'ratings',
    tags: ['goodreadsRating', 'goodreadsReviewCount', 'greater_than_equal_to', 'less_than'],
    group: {type: 'group', join: 'and', rules: [{field: 'goodreadsRating', operator: 'greater_than_equal_to', value: 4.0}, {field: 'goodreadsReviewCount', operator: 'less_than', value: 5000}, {field: 'goodreadsReviewCount', operator: 'greater_than', value: 0}]}
  },
  {
    id: 'universally-loved',
    name: 'Universally Loved (4.5+ on Multiple Platforms)',
    description: 'Books rated 4.5+ stars on both Amazon and Goodreads. Rare consensus across different reader communities.',
    category: 'ratings',
    tags: ['amazonRating', 'goodreadsRating', 'greater_than_equal_to'],
    group: {type: 'group', join: 'and', rules: [{field: 'amazonRating', operator: 'greater_than_equal_to', value: 4.5}, {field: 'goodreadsRating', operator: 'greater_than_equal_to', value: 4.5}]}
  },
  {
    id: 'my-favorites',
    name: 'My Top-Rated Books',
    description: 'Every book you\'ve rated 9 or 10 out of 10. Your personal hall of fame.',
    category: 'ratings',
    tags: ['personalRating', 'greater_than_equal_to'],
    group: {type: 'group', join: 'and', rules: [{field: 'personalRating', operator: 'greater_than_equal_to', value: 9}]}
  },
  {
    id: 'underrated-by-me',
    name: 'Books I Loved That Others Didn\'t',
    description: 'Books you rated 8+ that the community rates below 3.5. Your contrarian picks that deserve more love.',
    category: 'ratings',
    tags: ['personalRating', 'goodreadsRating', 'greater_than_equal_to', 'less_than'],
    group: {type: 'group', join: 'and', rules: [{field: 'personalRating', operator: 'greater_than_equal_to', value: 8}, {field: 'goodreadsRating', operator: 'less_than', value: 3.5}, {field: 'goodreadsRating', operator: 'greater_than', value: 0}]}
  },
  {
    id: 'bestsellers',
    name: 'Bestsellers (10K+ Reviews, 4+ Stars)',
    description: 'The blockbusters. Books with 10,000+ Amazon reviews and a 4.0+ rating that dominated reading conversations.',
    category: 'ratings',
    tags: ['amazonReviewCount', 'amazonRating', 'greater_than', 'greater_than_equal_to'],
    group: {type: 'group', join: 'and', rules: [{field: 'amazonReviewCount', operator: 'greater_than', value: 10000}, {field: 'amazonRating', operator: 'greater_than_equal_to', value: 4.0}]}
  },
  {
    id: 'needs-my-rating',
    name: 'Finished But Not Yet Rated',
    description: 'Books you\'ve finished reading but haven\'t rated yet. A gentle reminder to record your thoughts.',
    category: 'ratings',
    tags: ['readStatus', 'personalRating', 'is_empty'],
    group: {type: 'group', join: 'and', rules: [{field: 'readStatus', operator: 'equals', value: 'READ'}, {field: 'personalRating', operator: 'is_empty', value: null}]}
  },
  {
    id: 'disappointing-reads',
    name: 'Overhyped Disappointments',
    description: 'Books the community rated 4+ stars but you rated 4 or less. The hype didn\'t match your experience.',
    category: 'ratings',
    tags: ['personalRating', 'goodreadsRating', 'less_than_equal_to', 'greater_than_equal_to'],
    group: {type: 'group', join: 'and', rules: [{field: 'personalRating', operator: 'less_than_equal_to', value: 4}, {field: 'personalRating', operator: 'greater_than', value: 0}, {field: 'goodreadsRating', operator: 'greater_than_equal_to', value: 4.0}]}
  },

  // ===== SERIES & COLLECTIONS =====
  {
    id: 'next-in-series',
    name: 'Next Book in Each Series',
    description: 'Your automatically curated reading queue. For every series you\'ve started, this shows the next unread entry.',
    category: 'series',
    tags: ['seriesPosition', 'equals'],
    group: {type: 'group', join: 'and', rules: [{field: 'seriesPosition', operator: 'equals', value: 'next_unread'}]}
  },
  {
    id: 'unread-series-starters',
    name: 'Series Starters You Haven\'t Read',
    description: 'Every first book in a series that\'s still unread. Where new adventures begin.',
    category: 'series',
    tags: ['seriesPosition', 'readStatus', 'equals'],
    group: {type: 'group', join: 'and', rules: [{field: 'seriesPosition', operator: 'equals', value: 'first_in_series'}, {field: 'readStatus', operator: 'equals', value: 'UNREAD'}]}
  },
  {
    id: 'series-with-gaps',
    name: 'Series Missing Books',
    description: 'Series where the numbering has holes — you own book 1 and 3, but book 2 is missing. Find what needs completing.',
    category: 'series',
    tags: ['seriesGaps', 'equals'],
    group: {type: 'group', join: 'and', rules: [{field: 'seriesGaps', operator: 'equals', value: 'any_gap'}]}
  },
  {
    id: 'missing-book-one',
    name: 'Series Missing the First Book',
    description: 'Series where you don\'t own book one. You can\'t start without it — these are the gaps to fill first.',
    category: 'series',
    tags: ['seriesGaps', 'equals'],
    group: {type: 'group', join: 'and', rules: [{field: 'seriesGaps', operator: 'equals', value: 'missing_first'}]}
  },
  {
    id: 'fully-read-series',
    name: 'Completely Finished Series',
    description: 'Series where you\'ve read every single book. Your completed conquests and best recommendation sources.',
    category: 'series',
    tags: ['seriesStatus', 'equals'],
    group: {type: 'group', join: 'and', rules: [{field: 'seriesStatus', operator: 'equals', value: 'fully_read'}]}
  },
  {
    id: 'unstarted-series',
    name: 'Series You Haven\'t Started',
    description: 'Entire series sitting untouched in your library. You bought them with good intentions — now see which ones are waiting.',
    category: 'series',
    tags: ['seriesStatus', 'equals'],
    group: {type: 'group', join: 'and', rules: [{field: 'seriesStatus', operator: 'equals', value: 'not_started'}]}
  },
  {
    id: 'active-series',
    name: 'Series You\'re Currently Reading',
    description: 'Series where you\'re actively in the middle of at least one book. Keeps ongoing multi-book journeys visible.',
    category: 'series',
    tags: ['seriesStatus', 'equals'],
    group: {type: 'group', join: 'and', rules: [{field: 'seriesStatus', operator: 'equals', value: 'reading'}]}
  },
  {
    id: 'long-series',
    name: 'Long Series (10+ Books)',
    description: 'Series with 10 or more installments. These are the marathons — sprawling epics and long-running collections.',
    category: 'series',
    tags: ['seriesName', 'seriesTotal', 'is_not_empty', 'greater_than_equal_to'],
    group: {type: 'group', join: 'and', rules: [{field: 'seriesName', operator: 'is_not_empty', value: null}, {field: 'seriesTotal', operator: 'greater_than_equal_to', value: 10}]}
  },
  {
    id: 'standalone-books',
    name: 'Standalone Books (Not in a Series)',
    description: 'Self-contained stories with no sequels or cliffhangers. Complete experiences in a single book.',
    category: 'series',
    tags: ['seriesName', 'is_empty'],
    group: {type: 'group', join: 'and', rules: [{field: 'seriesName', operator: 'is_empty', value: null}]}
  },
  {
    id: 'ongoing-series',
    name: 'Series Still Being Published',
    description: 'Series where the author hasn\'t released the final book yet. Know what you\'re getting into before you start.',
    category: 'series',
    tags: ['seriesStatus', 'equals'],
    group: {type: 'group', join: 'and', rules: [{field: 'seriesStatus', operator: 'equals', value: 'ongoing'}]}
  },
  {
    id: 'duplicate-series',
    name: 'Duplicate Series Entries',
    description: 'Series where multiple books share the same number. Usually indicates duplicate imports or metadata conflicts that need cleanup.',
    category: 'series',
    tags: ['seriesGaps', 'equals'],
    group: {type: 'group', join: 'and', rules: [{field: 'seriesGaps', operator: 'equals', value: 'duplicate_number'}]}
  },

  // ===== LIBRARY MAINTENANCE =====
  {
    id: 'missing-core-metadata',
    name: 'Missing Essential Info',
    description: 'Books missing a title, author, or genre. These are the three fields every book should have — fix these first.',
    category: 'maintenance',
    tags: ['title', 'authors', 'categories', 'is_empty'],
    group: {type: 'group', join: 'or', rules: [{field: 'title', operator: 'is_empty', value: null}, {field: 'authors', operator: 'is_empty', value: null}, {field: 'categories', operator: 'is_empty', value: null}]}
  },
  {
    id: 'uncategorized',
    name: 'Books Without a Genre',
    description: 'Books with no category assigned. Without genres, these are invisible to every genre-based shelf you create.',
    category: 'maintenance',
    tags: ['categories', 'is_empty'],
    group: {type: 'group', join: 'and', rules: [{field: 'categories', operator: 'is_empty', value: null}]}
  },
  {
    id: 'no-description',
    name: 'Books Missing a Description',
    description: 'Books without a synopsis. These show up as blank cards when browsing and are harder to remember or recommend.',
    category: 'maintenance',
    tags: ['description', 'is_empty'],
    group: {type: 'group', join: 'and', rules: [{field: 'description', operator: 'is_empty', value: null}]}
  },
  {
    id: 'low-metadata-score',
    name: 'Low Quality Metadata (Under 50%)',
    description: 'Books where the metadata match confidence is below 50%. These may have wrong covers, descriptions, or edition data.',
    category: 'maintenance',
    tags: ['metadataScore', 'less_than', 'greater_than'],
    group: {type: 'group', join: 'and', rules: [{field: 'metadataScore', operator: 'less_than', value: 50}, {field: 'metadataScore', operator: 'greater_than', value: 0}]}
  },
  {
    id: 'missing-isbn',
    name: 'Books Without an ISBN',
    description: 'Books missing both ISBN-13 and ISBN-10. Without an ISBN, automatic metadata lookups won\'t work.',
    category: 'maintenance',
    tags: ['isbn13', 'isbn10', 'is_empty'],
    group: {type: 'group', join: 'and', rules: [{field: 'isbn13', operator: 'is_empty', value: null}, {field: 'isbn10', operator: 'is_empty', value: null}]}
  },
  {
    id: 'read-but-untagged',
    name: 'Finished But Not Tagged',
    description: 'Books you\'ve read but haven\'t added any personal tags. Tag them to unlock richer filtering across your library.',
    category: 'maintenance',
    tags: ['readStatus', 'tags', 'is_empty'],
    group: {type: 'group', join: 'and', rules: [{field: 'readStatus', operator: 'equals', value: 'READ'}, {field: 'tags', operator: 'is_empty', value: null}]}
  },
  {
    id: 'missing-publisher',
    name: 'Books Missing Publisher Info',
    description: 'Books with authors but no publisher. Common with self-published works or poorly scraped imports.',
    category: 'maintenance',
    tags: ['publisher', 'authors', 'is_empty', 'is_not_empty'],
    group: {type: 'group', join: 'and', rules: [{field: 'publisher', operator: 'is_empty', value: null}, {field: 'authors', operator: 'is_not_empty', value: null}]}
  },
  {
    id: 'no-mood-data',
    name: 'Books Without Mood Tags',
    description: 'Books missing mood descriptors like Dark, Cozy, or Suspenseful. Moods power mood-based recommendations.',
    category: 'maintenance',
    tags: ['moods', 'is_empty'],
    group: {type: 'group', join: 'and', rules: [{field: 'moods', operator: 'is_empty', value: null}]}
  },
  {
    id: 'missing-cover-or-desc',
    name: 'Missing Cover Image or Description',
    description: 'Books missing either a cover image or a description — the two most visible pieces of metadata.',
    category: 'maintenance',
    tags: ['metadataPresence', 'not_equals'],
    group: {type: 'group', join: 'or', rules: [{field: 'metadataPresence', operator: 'not_equals', value: 'thumbnailUrl'}, {field: 'metadataPresence', operator: 'not_equals', value: 'description'}]}
  },
  {
    id: 'no-external-ids',
    name: 'Books Without External IDs',
    description: 'Books missing Goodreads, Amazon, and Google identifiers. Without these, cross-platform lookups won\'t work.',
    category: 'maintenance',
    tags: ['metadataPresence', 'not_equals'],
    group: {type: 'group', join: 'and', rules: [{field: 'metadataPresence', operator: 'not_equals', value: 'goodreadsId'}, {field: 'metadataPresence', operator: 'not_equals', value: 'asin'}, {field: 'metadataPresence', operator: 'not_equals', value: 'googleId'}]}
  },
  {
    id: 'audiobooks-no-narrator',
    name: 'Audiobooks Missing Narrator Name',
    description: 'Audiobooks with a duration but no narrator listed. The narrator is crucial for audiobook quality.',
    category: 'maintenance',
    tags: ['metadataPresence', 'equals', 'not_equals'],
    group: {type: 'group', join: 'and', rules: [{field: 'metadataPresence', operator: 'equals', value: 'audiobookDuration'}, {field: 'metadataPresence', operator: 'not_equals', value: 'narrator'}]}
  },
  {
    id: 'well-catalogued',
    name: 'Perfectly Catalogued Books',
    description: 'Books with cover, description, authors, genres, and at least one external ID. Metadata in excellent shape.',
    category: 'maintenance',
    tags: ['metadataPresence', 'equals'],
    group: {type: 'group', join: 'and', rules: [{field: 'metadataPresence', operator: 'equals', value: 'thumbnailUrl'}, {field: 'metadataPresence', operator: 'equals', value: 'description'}, {field: 'metadataPresence', operator: 'equals', value: 'authors'}, {field: 'metadataPresence', operator: 'equals', value: 'categories'}, {type: 'group', join: 'or', rules: [{field: 'metadataPresence', operator: 'equals', value: 'goodreadsId'}, {field: 'metadataPresence', operator: 'equals', value: 'isbn13'}, {field: 'metadataPresence', operator: 'equals', value: 'asin'}]}]}
  },
  {
    id: 'comics-missing-creators',
    name: 'Comics Missing Creator Credits',
    description: 'Comic books with character data but missing penciller, inker, or cover artist information.',
    category: 'maintenance',
    tags: ['metadataPresence', 'equals', 'not_equals'],
    group: {type: 'group', join: 'and', rules: [{field: 'metadataPresence', operator: 'equals', value: 'comicCharacters'}, {type: 'group', join: 'or', rules: [{field: 'metadataPresence', operator: 'not_equals', value: 'comicPencillers'}, {field: 'metadataPresence', operator: 'not_equals', value: 'comicInkers'}, {field: 'metadataPresence', operator: 'not_equals', value: 'comicCoverArtists'}]}]}
  },

  // ===== DATE-BASED =====
  {
    id: 'added-this-week',
    name: 'Added This Week',
    description: 'Your newest acquisitions from the last 7 days. Always shows your freshest library additions.',
    category: 'dates',
    tags: ['addedOn', 'within_last'],
    group: {type: 'group', join: 'and', rules: [{field: 'addedOn', operator: 'within_last', value: 1, valueEnd: 'weeks'}]}
  },
  {
    id: 'gathering-dust',
    name: 'Gathering Dust (Added 90+ Days Ago, Never Opened)',
    description: 'Books added over 3 months ago that you\'ve never opened and are still unread. Good intentions waiting for action.',
    category: 'dates',
    tags: ['addedOn', 'lastReadTime', 'readStatus', 'older_than', 'is_empty'],
    group: {type: 'group', join: 'and', rules: [{field: 'addedOn', operator: 'older_than', value: 90, valueEnd: 'days'}, {field: 'lastReadTime', operator: 'is_empty', value: null}, {field: 'readStatus', operator: 'equals', value: 'UNREAD'}]}
  },
  {
    id: 'classic-literature',
    name: 'Classic Literature (Pre-1950)',
    description: 'Timeless works published before 1950. The books your English teacher would approve of.',
    category: 'dates',
    tags: ['publishedDate', 'less_than'],
    group: {type: 'group', join: 'and', rules: [{field: 'publishedDate', operator: 'less_than', value: '1950-01-01'}]}
  },
  {
    id: 'modern-releases',
    name: 'Modern Releases (2020 and Later)',
    description: 'Everything published from 2020 onward. The cutting edge of contemporary publishing.',
    category: 'dates',
    tags: ['publishedDate', 'greater_than_equal_to'],
    group: {type: 'group', join: 'and', rules: [{field: 'publishedDate', operator: 'greater_than_equal_to', value: '2020-01-01'}]}
  },
  {
    id: 'read-long-ago',
    name: 'Read Over a Year Ago',
    description: 'Books you finished more than a year ago. Enough time has passed that the details have faded — perfect for a re-read.',
    category: 'dates',
    tags: ['dateFinished', 'readStatus', 'older_than'],
    group: {type: 'group', join: 'and', rules: [{field: 'dateFinished', operator: 'older_than', value: 1, valueEnd: 'years'}, {field: 'readStatus', operator: 'equals', value: 'READ'}]}
  },

  // ===== AUTHOR & PUBLISHER =====
  {
    id: 'foreign-language',
    name: 'Non-English Books',
    description: 'Every book in your library that isn\'t in English. Great for language learners and translation collectors.',
    category: 'author',
    tags: ['language', 'not_equals', 'is_not_empty'],
    group: {type: 'group', join: 'and', rules: [{field: 'language', operator: 'not_equals', value: 'en'}, {field: 'language', operator: 'is_not_empty', value: null}]}
  },
  {
    id: 'specific-author',
    name: 'Books by a Specific Author',
    description: 'Build a dedicated shelf for any author. The "contains" search means partial names work — just type the author\'s last name as the value after applying.',
    category: 'author',
    tags: ['authors', 'contains'],
    group: {type: 'group', join: 'and', rules: [{field: 'authors', operator: 'contains', value: ''}]}
  },
  {
    id: 'publisher-spotlight',
    name: 'Books from a Specific Publisher',
    description: 'Group all books from one publisher. Useful if you\'ve noticed you love books from certain imprints. Edit the value after applying.',
    category: 'author',
    tags: ['publisher', 'contains'],
    group: {type: 'group', join: 'and', rules: [{field: 'publisher', operator: 'contains', value: ''}]}
  },
  {
    id: 'books-with-subtitles',
    name: 'Books That Have Subtitles',
    description: 'Books with subtitle metadata — often non-fiction, academic works, or annotated editions.',
    category: 'author',
    tags: ['subtitle', 'is_not_empty'],
    group: {type: 'group', join: 'and', rules: [{field: 'subtitle', operator: 'is_not_empty', value: null}]}
  },

  // ===== FILE & FORMAT =====
  {
    id: 'epub-library',
    name: 'EPUB Format Books',
    description: 'All your EPUB books in one place. The gold standard for reflowable e-reading.',
    category: 'files',
    tags: ['fileType', 'equals'],
    group: {type: 'group', join: 'and', rules: [{field: 'fileType', operator: 'equals', value: 'EPUB'}]}
  },
  {
    id: 'comics-archive',
    name: 'Comic Book Files (CBR, CBZ, CB7)',
    description: 'Everything in comic book archive formats. Your visual storytelling collection identified by file type.',
    category: 'files',
    tags: ['fileType', 'includes_any'],
    group: {type: 'group', join: 'and', rules: [{field: 'fileType', operator: 'includes_any', value: ['CBR', 'CBZ', 'CB7']}]}
  },
  {
    id: 'oversized-files',
    name: 'Large Files (100 MB or More)',
    description: 'Files over 100 MB eating through your storage. Usually image-heavy PDFs, uncompressed comics, or scanned books.',
    category: 'files',
    tags: ['fileSize', 'greater_than'],
    group: {type: 'group', join: 'and', rules: [{field: 'fileSize', operator: 'greater_than', value: 102400}]}
  },
  {
    id: 'physical-books',
    name: 'Physical Book Collection',
    description: 'Every book you\'ve marked as a physical copy. A digital mirror of your real-world bookshelves.',
    category: 'files',
    tags: ['isPhysical', 'equals'],
    group: {type: 'group', join: 'and', rules: [{field: 'isPhysical', operator: 'equals', value: true}]}
  },
  {
    id: 'pdf-conversion-queue',
    name: 'Unread PDFs (Conversion Candidates)',
    description: 'Unread PDFs that might benefit from conversion to EPUB for a better reading experience on e-readers and phones.',
    category: 'files',
    tags: ['fileType', 'readStatus', 'equals'],
    group: {type: 'group', join: 'and', rules: [{field: 'fileType', operator: 'equals', value: 'PDF'}, {field: 'readStatus', operator: 'equals', value: 'UNREAD'}]}
  },

  // ===== AUDIOBOOKS =====
  {
    id: 'all-audiobooks',
    name: 'All Audiobooks',
    description: 'Every audiobook in your collection, identified by having a duration. Your complete narrated library.',
    category: 'audiobooks',
    tags: ['audiobookDuration', 'greater_than'],
    group: {type: 'group', join: 'and', rules: [{field: 'audiobookDuration', operator: 'greater_than', value: 0}]}
  },
  {
    id: 'long-audiobooks',
    name: 'Long Audiobooks (10+ Hours)',
    description: 'Audiobooks over 10 hours. Marathon listens for road trips, long projects, or weeks of commuting.',
    category: 'audiobooks',
    tags: ['audiobookDuration', 'greater_than_equal_to'],
    group: {type: 'group', join: 'and', rules: [{field: 'audiobookDuration', operator: 'greater_than_equal_to', value: 36000}]}
  },
  {
    id: 'short-audiobooks',
    name: 'Short Audiobooks (Under 3 Hours)',
    description: 'Audiobooks under 3 hours you can finish in a single session. Perfect for a short commute or afternoon walk.',
    category: 'audiobooks',
    tags: ['audiobookDuration', 'greater_than', 'less_than'],
    group: {type: 'group', join: 'and', rules: [{field: 'audiobookDuration', operator: 'greater_than', value: 0}, {field: 'audiobookDuration', operator: 'less_than', value: 10800}]}
  },
  {
    id: 'unabridged-only',
    name: 'Unabridged Audiobooks Only',
    description: 'The complete, uncut audiobook experience. No chapters skipped, no passages summarized.',
    category: 'audiobooks',
    tags: ['abridged', 'narrator', 'equals', 'is_not_empty'],
    group: {type: 'group', join: 'and', rules: [{field: 'abridged', operator: 'equals', value: false}, {field: 'narrator', operator: 'is_not_empty', value: null}]}
  },
  {
    id: 'top-audible',
    name: 'Highly Rated Audiobooks (4.5+ on Audible)',
    description: 'Audiobooks rated 4.5+ on Audible where narrator performance and source material create something special.',
    category: 'audiobooks',
    tags: ['audibleRating', 'narrator', 'greater_than_equal_to', 'is_not_empty'],
    group: {type: 'group', join: 'and', rules: [{field: 'audibleRating', operator: 'greater_than_equal_to', value: 4.5}, {field: 'narrator', operator: 'is_not_empty', value: null}]}
  },

  // ===== ADVANCED COMBOS =====
  {
    id: 'book-club-picks',
    name: 'Book Club Candidates',
    description: 'Unread fiction between 200–400 pages with a 3.8+ community rating. Long enough for discussion, short enough to finish in a month.',
    category: 'advanced',
    tags: ['readStatus', 'pageCount', 'goodreadsRating', 'categories', 'in_between'],
    group: {type: 'group', join: 'and', rules: [{field: 'readStatus', operator: 'equals', value: 'UNREAD'}, {field: 'pageCount', operator: 'in_between', valueStart: 200, valueEnd: 400}, {field: 'goodreadsRating', operator: 'greater_than_equal_to', value: 3.8}, {field: 'categories', operator: 'includes_any', value: ['Fiction', 'Literary Fiction', 'Contemporary']}]}
  },
  {
    id: 'travel-reads',
    name: 'Travel-Friendly Reads',
    description: 'Compact unread EPUBs under 300 pages. Light on your device and achievable within a vacation\'s reading time.',
    category: 'advanced',
    tags: ['readStatus', 'fileType', 'pageCount', 'less_than'],
    group: {type: 'group', join: 'and', rules: [{field: 'readStatus', operator: 'equals', value: 'UNREAD'}, {field: 'fileType', operator: 'equals', value: 'EPUB'}, {field: 'pageCount', operator: 'less_than', value: 300}, {field: 'pageCount', operator: 'greater_than', value: 0}]}
  },
  {
    id: 'award-worthy',
    name: 'Award-Caliber Literary Fiction',
    description: 'Literary fiction with a 4.2+ rating and 10,000+ reviews. The kind of books that end up on prize shortlists.',
    category: 'advanced',
    tags: ['goodreadsRating', 'goodreadsReviewCount', 'categories', 'greater_than_equal_to', 'greater_than'],
    group: {type: 'group', join: 'and', rules: [{field: 'goodreadsRating', operator: 'greater_than_equal_to', value: 4.2}, {field: 'goodreadsReviewCount', operator: 'greater_than', value: 10000}, {field: 'categories', operator: 'includes_any', value: ['Literary Fiction', 'Fiction', 'Contemporary Fiction']}]}
  },
  {
    id: 'spooky-season',
    name: 'Spooky Season Reading List',
    description: 'Unread horror, gothic, and supernatural books under 400 pages. Sized perfectly for one per week during October.',
    category: 'advanced',
    tags: ['readStatus', 'pageCount', 'categories', 'less_than_equal_to'],
    group: {type: 'group', join: 'and', rules: [{field: 'readStatus', operator: 'equals', value: 'UNREAD'}, {field: 'pageCount', operator: 'less_than_equal_to', value: 400}, {field: 'categories', operator: 'includes_any', value: ['Horror', 'Gothic', 'Supernatural', 'Paranormal', 'Ghost Stories']}]}
  },
  {
    id: 'beach-reads',
    name: 'Light & Breezy Summer Reads',
    description: 'Unread books under 350 pages with feel-good moods. Poolside reading where the stakes are low and the vibes are high.',
    category: 'advanced',
    tags: ['readStatus', 'pageCount', 'moods', 'less_than', 'includes_any'],
    group: {type: 'group', join: 'and', rules: [{field: 'readStatus', operator: 'equals', value: 'UNREAD'}, {field: 'pageCount', operator: 'less_than', value: 350}, {field: 'moods', operator: 'includes_any', value: ['Light', 'Fun', 'Romantic', 'Heartwarming', 'Feel-Good']}]}
  },
  {
    id: 'premium-unread-fantasy',
    name: 'Premium Unread Fantasy',
    description: 'Unread fantasy books rated 4.0+ on either Amazon or Goodreads. Uses a nested OR so you don\'t miss single-platform gems.',
    category: 'advanced',
    tags: ['readStatus', 'categories', 'goodreadsRating', 'amazonRating', 'greater_than_equal_to'],
    group: {type: 'group', join: 'and', rules: [{field: 'readStatus', operator: 'equals', value: 'UNREAD'}, {field: 'categories', operator: 'includes_any', value: ['Fantasy', 'Epic Fantasy', 'Urban Fantasy', 'Dark Fantasy']}, {type: 'group', join: 'or', rules: [{field: 'goodreadsRating', operator: 'greater_than_equal_to', value: 4.0}, {field: 'amazonRating', operator: 'greater_than_equal_to', value: 4.0}]}]}
  },
  {
    id: 'nostalgia-reread',
    name: 'Nostalgia Re-Reads (Finished 2+ Years Ago)',
    description: 'Books you finished over 2 years ago and rated 8+. Enough time has passed that the story will feel fresh again.',
    category: 'advanced',
    tags: ['readStatus', 'personalRating', 'dateFinished', 'older_than'],
    group: {type: 'group', join: 'and', rules: [{field: 'readStatus', operator: 'equals', value: 'READ'}, {field: 'personalRating', operator: 'greater_than_equal_to', value: 8}, {field: 'dateFinished', operator: 'older_than', value: 2, valueEnd: 'years'}]}
  },
  {
    id: 'new-arrivals-needing-attention',
    name: 'New Arrivals Needing Metadata Fixes',
    description: 'Books added in the last 2 weeks with low metadata scores, missing genres, or no description. Catch issues early.',
    category: 'advanced',
    tags: ['addedOn', 'metadataScore', 'categories', 'description', 'within_last', 'less_than', 'is_empty'],
    group: {type: 'group', join: 'and', rules: [{field: 'addedOn', operator: 'within_last', value: 2, valueEnd: 'weeks'}, {type: 'group', join: 'or', rules: [{field: 'metadataScore', operator: 'less_than', value: 50}, {field: 'categories', operator: 'is_empty', value: null}, {field: 'description', operator: 'is_empty', value: null}]}]}
  },
  {
    id: 'highly-rated-short',
    name: 'Highly Rated Short Reads (Under 250 Pages)',
    description: 'Books under 250 pages that you rated 8+. Tight, focused, perfectly-paced reads that don\'t waste a single page.',
    category: 'advanced',
    tags: ['pageCount', 'personalRating', 'less_than', 'greater_than_equal_to'],
    group: {type: 'group', join: 'and', rules: [{field: 'pageCount', operator: 'less_than', value: 250}, {field: 'pageCount', operator: 'greater_than', value: 0}, {field: 'personalRating', operator: 'greater_than_equal_to', value: 8}]}
  },
  {
    id: 'unread-series-starters-rated',
    name: 'Highly Rated Series Starters You Haven\'t Read',
    description: 'First books in series rated 4.0+ that you haven\'t read yet. The best entry points into new series.',
    category: 'advanced',
    tags: ['seriesPosition', 'readStatus', 'goodreadsRating', 'equals', 'greater_than_equal_to'],
    group: {type: 'group', join: 'and', rules: [{field: 'seriesPosition', operator: 'equals', value: 'first_in_series'}, {field: 'readStatus', operator: 'equals', value: 'UNREAD'}, {field: 'goodreadsRating', operator: 'greater_than_equal_to', value: 4.0}]}
  },
  {
    id: 'mature-content',
    name: 'Mature & Adult Content',
    description: 'Books rated Mature, Adult, or Explicit. Useful for keeping age-restricted content organized separately.',
    category: 'advanced',
    tags: ['contentRating', 'includes_any'],
    group: {type: 'group', join: 'and', rules: [{field: 'contentRating', operator: 'includes_any', value: ['MATURE', 'ADULT', 'EXPLICIT']}]}
  },
  {
    id: 'recently-added-highly-rated',
    name: 'Recently Added & Highly Rated',
    description: 'Books added in the last month with 4.0+ ratings on Goodreads, Amazon, or Hardcover. Your most promising new additions.',
    category: 'advanced',
    tags: ['addedOn', 'goodreadsRating', 'amazonRating', 'hardcoverRating', 'within_last', 'greater_than_equal_to'],
    group: {type: 'group', join: 'and', rules: [{field: 'addedOn', operator: 'within_last', value: 1, valueEnd: 'months'}, {type: 'group', join: 'or', rules: [{field: 'goodreadsRating', operator: 'greater_than_equal_to', value: 4.0}, {field: 'amazonRating', operator: 'greater_than_equal_to', value: 4.0}, {field: 'hardcoverRating', operator: 'greater_than_equal_to', value: 4.0}]}]}
  },
  {
    id: 'cross-platform-favorites',
    name: 'Loved Across Platforms (4.0+, 1000+ Reviews)',
    description: 'Books rated 4.0+ on both Goodreads and Amazon with 1,000+ reviews each. When two different communities agree, it\'s special.',
    category: 'advanced',
    tags: ['goodreadsRating', 'amazonRating', 'goodreadsReviewCount', 'amazonReviewCount', 'greater_than_equal_to', 'greater_than'],
    group: {type: 'group', join: 'and', rules: [{field: 'goodreadsRating', operator: 'greater_than_equal_to', value: 4.0}, {field: 'amazonRating', operator: 'greater_than_equal_to', value: 4.0}, {field: 'goodreadsReviewCount', operator: 'greater_than', value: 1000}, {field: 'amazonReviewCount', operator: 'greater_than', value: 1000}]}
  },
  {
    id: 'binge-worthy-series',
    name: 'Binge-Worthy Completed Series',
    description: 'Fully read series with 5+ books where you rated the first entry 8+. Verified binge-worthy series worth recommending.',
    category: 'advanced',
    tags: ['seriesStatus', 'seriesTotal', 'seriesPosition', 'personalRating', 'equals', 'greater_than_equal_to'],
    group: {type: 'group', join: 'and', rules: [{field: 'seriesStatus', operator: 'equals', value: 'fully_read'}, {field: 'seriesTotal', operator: 'greater_than_equal_to', value: 5}, {field: 'seriesPosition', operator: 'equals', value: 'first_in_series'}, {field: 'personalRating', operator: 'greater_than_equal_to', value: 8}]}
  },
  {
    id: 'should-i-keep',
    name: 'Library Cleanup Candidates',
    description: 'Books with low ratings (3 or less), no tags, and added 6+ months ago. If it\'s been that long with a bad rating, consider removing it.',
    category: 'advanced',
    tags: ['personalRating', 'tags', 'addedOn', 'less_than_equal_to', 'is_empty', 'older_than'],
    group: {type: 'group', join: 'and', rules: [{field: 'personalRating', operator: 'less_than_equal_to', value: 3}, {field: 'personalRating', operator: 'greater_than', value: 0}, {field: 'tags', operator: 'is_empty', value: null}, {field: 'addedOn', operator: 'older_than', value: 6, valueEnd: 'months'}]}
  },
  {
    id: 'dark-atmospheric-fantasy',
    name: 'Dark & Gritty Fantasy',
    description: 'Fantasy with dark, atmospheric, gritty, and bleak moods. Filtered for 3.8+ community rating so you get quality with your darkness.',
    category: 'advanced',
    tags: ['categories', 'moods', 'goodreadsRating', 'includes_any', 'greater_than_equal_to'],
    group: {type: 'group', join: 'and', rules: [{field: 'categories', operator: 'includes_any', value: ['Fantasy', 'Dark Fantasy', 'Epic Fantasy', 'Grimdark']}, {field: 'moods', operator: 'includes_any', value: ['Dark', 'Atmospheric', 'Gritty', 'Bleak']}, {field: 'goodreadsRating', operator: 'greater_than_equal_to', value: 3.8}]}
  },
  {
    id: 'nonfiction-deep-dives',
    name: 'Long-Form Non-Fiction (500+ Pages)',
    description: 'Non-fiction over 500 pages. Sweeping histories, comprehensive biographies, and dense scientific explorations.',
    category: 'advanced',
    tags: ['categories', 'pageCount', 'includes_any', 'greater_than_equal_to'],
    group: {type: 'group', join: 'and', rules: [{field: 'categories', operator: 'includes_any', value: ['Non-Fiction', 'Nonfiction', 'History', 'Science', 'Biography', 'Economics', 'Politics']}, {field: 'pageCount', operator: 'greater_than_equal_to', value: 500}]}
  },
  {
    id: 'paused-recovery',
    name: 'Paused & Partially Read Books',
    description: 'Books you set aside — either paused or partially read. A second-chance shelf for books that deserve another look.',
    category: 'advanced',
    tags: ['readStatus', 'equals'],
    group: {type: 'group', join: 'or', rules: [{field: 'readStatus', operator: 'equals', value: 'PAUSED'}, {field: 'readStatus', operator: 'equals', value: 'PARTIALLY_READ'}]}
  },
  {
    id: 'genre-crossovers',
    name: 'Genre-Bending Sci-Fi Crossovers',
    description: 'Sci-fi books that also carry mystery, thriller, romance, or horror tags. Stories that refuse to stay in one lane.',
    category: 'advanced',
    tags: ['categories', 'includes_any'],
    group: {type: 'group', join: 'and', rules: [{field: 'categories', operator: 'includes_any', value: ['Science Fiction']}, {field: 'categories', operator: 'includes_any', value: ['Mystery', 'Thriller', 'Romance', 'Horror']}]}
  },
  {
    id: 'weekend-tbr',
    name: 'Weekend Reading List',
    description: 'Unread books between 150–300 pages with either a 4.0+ community rating or a 7+ personal rating. Achievable in a weekend.',
    category: 'advanced',
    tags: ['readStatus', 'pageCount', 'goodreadsRating', 'personalRating', 'in_between', 'greater_than_equal_to'],
    group: {type: 'group', join: 'and', rules: [{field: 'readStatus', operator: 'equals', value: 'UNREAD'}, {field: 'pageCount', operator: 'in_between', valueStart: 150, valueEnd: 300}, {type: 'group', join: 'or', rules: [{field: 'goodreadsRating', operator: 'greater_than_equal_to', value: 4.0}, {field: 'personalRating', operator: 'greater_than_equal_to', value: 7}]}]}
  },
];
