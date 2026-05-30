import {SortDirection, SortOption} from '../../model/sort.model';

export function isDirectoryScopeActive(activeDirFilterPath: string | null): boolean {
  return activeDirFilterPath !== null;
}

export function getDirectoryScopedSortCriteria(baseSortCriteria: SortOption[], defaultSortOption: SortOption): SortOption[] {
  const fileNameSort = baseSortCriteria.find(criterion => criterion.field === 'fileName');

  return [{
    ...defaultSortOption,
    direction: fileNameSort?.direction ?? defaultSortOption.direction ?? SortDirection.ASCENDING,
  }];
}