import {SortOption} from './sort.model';
import {BookType} from './book.model';

export type MetadataSource = 'EMBEDDED' | 'SIDECAR' | 'PREFER_SIDECAR' | 'PREFER_EMBEDDED' | 'NONE';

export type OrganizationMode = 'BOOK_PER_FILE' | 'BOOK_PER_FOLDER' | 'AUTO_DETECT';

export type DirectoryTagDepth = 'LAST_ONLY' | 'ALL_SEGMENTS';

export interface Library {
  id?: number;
  name: string;
  icon?: string | null;
  iconType?: 'PRIME_NG' | 'CUSTOM_SVG' | null;
  watch: boolean;
  fileNamingPattern?: string;
  sort?: SortOption;
  paths: LibraryPath[];
  formatPriority?: BookType[];
  allowedFormats?: BookType[];
  metadataSource?: MetadataSource;
  organizationMode?: OrganizationMode;
  tagByDirectory?: boolean;
  directoryTagDepth?: DirectoryTagDepth;
}

export interface LibraryPath {
  id?: number;
  path: string;
}
