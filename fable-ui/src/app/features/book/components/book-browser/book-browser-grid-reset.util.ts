import {SortOption} from '../../model/sort.model';

export interface GridViewportContext {
  viewMode: string | undefined;
  entityType: string | undefined;
  sortSignature: string;
  filterMode: string;
  searchTerm: string;
  activeDirFilterPath: string | null;
  filterSignature: string;
}

interface BuildGridViewportContextInput {
  viewMode: string | undefined;
  entityType: string | undefined;
  sortCriteria: SortOption[];
  filterMode: string;
  searchTerm: string;
  activeDirFilterPath: string | null;
  filterSignature: string;
}

export function buildGridViewportContext(input: BuildGridViewportContextInput): GridViewportContext {
  return {
    viewMode: input.viewMode,
    entityType: input.entityType,
    sortSignature: JSON.stringify(input.sortCriteria.map(sort => [sort.field, sort.direction])),
    filterMode: input.filterMode,
    searchTerm: input.searchTerm.trim(),
    activeDirFilterPath: input.activeDirFilterPath,
    filterSignature: input.filterSignature,
  };
}

export function shouldResetGridViewport(
  previous: GridViewportContext | null,
  next: GridViewportContext,
): boolean {
  if (next.viewMode !== 'grid') {
    return false;
  }

  if (!previous) {
    return true;
  }

  return previous.viewMode !== next.viewMode
    || previous.entityType !== next.entityType
    || previous.sortSignature !== next.sortSignature
    || previous.filterMode !== next.filterMode
    || previous.searchTerm !== next.searchTerm
    || previous.activeDirFilterPath !== next.activeDirFilterPath
    || previous.filterSignature !== next.filterSignature;
}