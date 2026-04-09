import {TestBed} from '@angular/core/testing';
import {BehaviorSubject, of, Subject} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {TranslocoService} from '@jsverse/transloco';
import {EntityType} from '../book-browser.component';
import {BookFilterComponent} from './book-filter.component';
import {BookFilterService} from './book-filter.service';
import {BookFilterMode, UserService} from '../../../../settings/user-management/user.service';

describe('BookFilterComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BookFilterComponent],
      providers: [
        {
          provide: BookFilterService,
          useValue: {
            createFilterStreams: vi.fn(() => ({})),
            processFilterValue: vi.fn((_: string, value: unknown) => value),
          },
        },
        {
          provide: UserService,
          useValue: {
            userState$: new BehaviorSubject(null),
            updateUserSetting: vi.fn(),
          },
        },
        {
          provide: TranslocoService,
          useValue: {
            translate: vi.fn((key: string) => key),
          },
        },
      ]
    }).compileComponents();
  });

  function createComponent(): BookFilterComponent {
    const fixture = TestBed.createComponent(BookFilterComponent);
    const component = fixture.componentInstance;
    component.resetFilter$ = new Subject<void>();
    component.entity$ = of(null);
    component.entityType$ = of(EntityType.ALL_BOOKS);
    return component;
  }

  it('treats numeric and string filter ids as the same active selection', () => {
    const component = createComponent();
    component.activeFilters = {library: [1]};

    expect(component.isFilterActive('library', '1')).toBe(true);
    expect(component.isFilterActive('library', 1)).toBe(true);
  });

  it('NOT mode accumulates multiple filter values within the same category', () => {
    const component = createComponent();
    component.filterMode = 'not';

    component.handleFilterClick('author', 'John');
    expect(component.activeFilters).toEqual({author: ['John']});

    component.handleFilterClick('author', 'Jane');
    expect(component.activeFilters).toEqual({author: ['John', 'Jane']});
  });

  it('NOT mode accumulates filters across categories', () => {
    const component = createComponent();
    component.filterMode = 'not';

    component.handleFilterClick('author', 'John');
    component.handleFilterClick('tag', 'fiction');

    expect(component.activeFilters).toEqual({author: ['John'], tag: ['fiction']});
  });

  it('NOT mode emits all accumulated filters', () => {
    const component = createComponent();
    component.filterMode = 'not';
    const emissions: unknown[] = [];
    component.filterSelected.subscribe(v => emissions.push(v));

    component.handleFilterClick('author', 'John');
    component.handleFilterClick('tag', 'fiction');

    expect(emissions.length).toBe(2);
    expect(emissions[1]).toEqual({author: ['John'], tag: ['fiction']});
  });

  it('single mode replaces the selection on each click', () => {
    const component = createComponent();
    component.filterMode = 'single';

    component.handleFilterClick('author', 'John');
    expect(component.activeFilters).toEqual({author: ['John']});

    component.handleFilterClick('author', 'Jane');
    expect(component.activeFilters).toEqual({author: ['Jane']});

    component.handleFilterClick('tag', 'fiction');
    expect(component.activeFilters).toEqual({tag: ['fiction']});
  });

  it('OR mode accumulates filter values like NOT', () => {
    const component = createComponent();
    component.filterMode = 'or';

    component.handleFilterClick('author', 'John');
    component.handleFilterClick('author', 'Jane');

    expect(component.activeFilters).toEqual({author: ['John', 'Jane']});
  });

  it('AND mode accumulates filter values', () => {
    const component = createComponent();
    component.filterMode = 'and';

    component.handleFilterClick('author', 'John');
    component.handleFilterClick('tag', 'fiction');

    expect(component.activeFilters).toEqual({author: ['John'], tag: ['fiction']});
  });

  it('NOT mode survives setFilters round-trip and still accumulates', () => {
    const component = createComponent();
    component.filterMode = 'not';

    // User clicks author "John"
    component.handleFilterClick('author', 'John');
    expect(component.activeFilters).toEqual({author: ['John']});

    // Simulate URL round-trip: parent calls setFilters with deserialized URL data
    component.setFilters({author: ['John']});
    expect(component.activeFilters).toEqual({author: ['John']});

    // User clicks tag "fiction" AFTER the round-trip
    component.handleFilterClick('tag', 'fiction');
    expect(component.activeFilters).toEqual({author: ['John'], tag: ['fiction']});
  });

  it('mode change followed by clicks works correctly for each mode', () => {
    const component = createComponent();
    const modeEmissions: BookFilterMode[] = [];
    component.filterModeChanged.subscribe((m: BookFilterMode) => modeEmissions.push(m));

    // Switch to NOT mode
    component.changeFilterMode('not');
    expect(modeEmissions).toEqual(['not']);
    component.filterMode = 'not';

    // Simulate parent clearing filters (as clearSidebarFiltersState would)
    component.clearActiveFilter();
    expect(component.activeFilters).toEqual({});

    // Now click filters in NOT mode
    component.handleFilterClick('author', 'John');
    component.handleFilterClick('author', 'Jane');
    expect(component.activeFilters).toEqual({author: ['John', 'Jane']});

    // Switch to single mode
    component.changeFilterMode('single');
  component.filterMode = 'single';
    component.clearActiveFilter();

    // Click in single mode
    component.handleFilterClick('author', 'John');
    expect(component.activeFilters).toEqual({author: ['John']});
    component.handleFilterClick('author', 'Jane');
    expect(component.activeFilters).toEqual({author: ['Jane']});
  });

  it('emitted filters include correct mode signal for SideBarFilter', () => {
    const component = createComponent();
    const filterEmissions: unknown[] = [];
    const modeEmissions: BookFilterMode[] = [];

    component.filterSelected.subscribe(v => filterEmissions.push(JSON.parse(JSON.stringify(v))));
    component.filterModeChanged.subscribe((m: BookFilterMode) => modeEmissions.push(m));

    // Set NOT mode
    component.changeFilterMode('not');
    component.filterMode = 'not';
    component.clearActiveFilter(); // parent would do this

    // Click two different filter types
    component.handleFilterClick('author', 'John');
    component.handleFilterClick('tag', 'fiction');

    // Last emission should have both filters
    const last = filterEmissions[filterEmissions.length - 1] as Record<string, unknown[]>;
    expect(last['author']).toEqual(['John']);
    expect(last['tag']).toEqual(['fiction']);
  });

  it('mode changes do not emit stale filter selections before the parent resets state', () => {
    const component = createComponent();
    component.activeFilters = {author: ['John']};

    const filterEmissions: unknown[] = [];
    const modeEmissions: BookFilterMode[] = [];

    component.filterSelected.subscribe(v => filterEmissions.push(v));
    component.filterModeChanged.subscribe((m: BookFilterMode) => modeEmissions.push(m));

    component.changeFilterMode('not');

    expect(modeEmissions).toEqual(['not']);
    expect(filterEmissions).toEqual([]);
    expect(component.selectedFilterMode).toBe('and');
    expect(component.activeFilters).toEqual({author: ['John']});

    component.clearActiveFilter();
    component.filterMode = 'not';

    expect(component.activeFilters).toEqual({});
    expect(component.selectedFilterMode).toBe('not');
  });
});