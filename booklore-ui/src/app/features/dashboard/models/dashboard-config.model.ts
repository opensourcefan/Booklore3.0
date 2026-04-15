export enum ScrollerType {
  LAST_READ = 'lastRead',
  LAST_LISTENED = 'lastListened',
  LATEST_ADDED = 'latestAdded',
  RANDOM = 'random',
  MAGIC_SHELF = 'magicShelf'
}

export const DEFAULT_MAX_ITEMS = 20;
export const MIN_ITEMS = 1;
export const MAX_ITEMS = 20;
export const MAX_DASHBOARD_GRID_COLUMNS = 12;

const DEFAULT_LAYOUT_LOCKED = false;

export interface ScrollerConfig {
  id: string;
  type: ScrollerType;
  title: string;
  enabled: boolean;
  order: number;
  maxItems: number;
  magicShelfId?: number;
  sortField?: string;
  sortDirection?: string;
  libraryId?: number | null;
  columnSpan?: number | null;
}

export interface DashboardConfig {
  scrollers: ScrollerConfig[];
  layoutLocked?: boolean;
}

const DEFAULT_DASHBOARD_SCROLLERS: ScrollerConfig[] = [
  {id: '1', type: ScrollerType.LAST_LISTENED, title: 'dashboard.scroller.continueListening', enabled: true, order: 1, maxItems: DEFAULT_MAX_ITEMS, libraryId: null, columnSpan: null},
  {id: '2', type: ScrollerType.LAST_READ, title: 'dashboard.scroller.continueReading', enabled: true, order: 2, maxItems: DEFAULT_MAX_ITEMS, libraryId: null, columnSpan: null},
  {id: '3', type: ScrollerType.LATEST_ADDED, title: 'dashboard.scroller.recentlyAdded', enabled: true, order: 3, maxItems: DEFAULT_MAX_ITEMS, libraryId: null, columnSpan: null},
  {id: '4', type: ScrollerType.RANDOM, title: 'dashboard.scroller.discoverNew', enabled: true, order: 4, maxItems: DEFAULT_MAX_ITEMS, libraryId: null, columnSpan: null}
];

export function getDefaultScrollerTitleKey(type: ScrollerType): string {
  switch (type) {
    case ScrollerType.LAST_READ:
      return 'dashboard.scroller.continueReading';
    case ScrollerType.LAST_LISTENED:
      return 'dashboard.scroller.continueListening';
    case ScrollerType.LATEST_ADDED:
      return 'dashboard.scroller.recentlyAdded';
    case ScrollerType.RANDOM:
      return 'dashboard.scroller.discoverNew';
    case ScrollerType.MAGIC_SHELF:
      return 'dashboard.scroller.magicShelf';
    default:
      return 'dashboard.scroller.default';
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeColumnSpan(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) {
    return null;
  }

  return clamp(Math.round(value), 1, MAX_DASHBOARD_GRID_COLUMNS);
}

function normalizeScrollerConfig(scroller: Partial<ScrollerConfig>, index: number): ScrollerConfig {
  const type = scroller.type ?? ScrollerType.LATEST_ADDED;

  return {
    id: scroller.id ?? `${index + 1}`,
    type,
    title: scroller.title ?? getDefaultScrollerTitleKey(type),
    enabled: scroller.enabled ?? true,
    order: scroller.order ?? index + 1,
    maxItems: clamp(Number.isFinite(scroller.maxItems) ? Number(scroller.maxItems) : DEFAULT_MAX_ITEMS, MIN_ITEMS, MAX_ITEMS),
    magicShelfId: type === ScrollerType.MAGIC_SHELF ? scroller.magicShelfId : undefined,
    sortField: type === ScrollerType.MAGIC_SHELF ? scroller.sortField : undefined,
    sortDirection: type === ScrollerType.MAGIC_SHELF ? scroller.sortDirection : undefined,
    libraryId: scroller.libraryId ?? null,
    columnSpan: normalizeColumnSpan(scroller.columnSpan)
  };
}

export function cloneDashboardConfig(config: DashboardConfig): DashboardConfig {
  return JSON.parse(JSON.stringify(config)) as DashboardConfig;
}

export function normalizeDashboardConfig(config?: DashboardConfig | null): DashboardConfig {
  const sourceScrollers = config?.scrollers?.length ? config.scrollers : DEFAULT_DASHBOARD_SCROLLERS;
  const normalizedScrollers = sourceScrollers
    .map((scroller, index) => normalizeScrollerConfig(scroller, index))
    .sort((a, b) => a.order - b.order)
    .map((scroller, index) => ({...scroller, order: index + 1, id: scroller.id || `${index + 1}`}));

  return {
    layoutLocked: config?.layoutLocked ?? DEFAULT_LAYOUT_LOCKED,
    scrollers: normalizedScrollers
  };
}

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = normalizeDashboardConfig({
  layoutLocked: DEFAULT_LAYOUT_LOCKED,
  scrollers: DEFAULT_DASHBOARD_SCROLLERS
});
