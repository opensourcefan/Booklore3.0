import {MetadataRefreshType} from './metadata-refresh-type.enum';
import {MetadataRefreshOptions} from './metadata-refresh-options.model';

export type MetadataRefreshTargetMode = 'ALL' | 'NEVER_FETCHED' | 'OLDER_THAN_DAYS';

export interface MetadataRefreshRequest {
  refreshType: MetadataRefreshType;
  libraryId?: number;
  bookIds?: number[];
  refreshOptions?: MetadataRefreshOptions;
  targetMode?: MetadataRefreshTargetMode;
  olderThanDays?: number | null;
}
