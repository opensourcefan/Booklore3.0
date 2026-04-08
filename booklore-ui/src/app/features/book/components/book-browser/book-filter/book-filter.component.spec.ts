import {TestBed} from '@angular/core/testing';
import {BehaviorSubject, of, Subject} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {TranslocoService} from '@jsverse/transloco';
import {EntityType} from '../book-browser.component';
import {BookFilterComponent} from './book-filter.component';
import {BookFilterService} from './book-filter.service';
import {UserService} from '../../../../settings/user-management/user.service';

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

  it('treats numeric and string filter ids as the same active selection', () => {
    const fixture = TestBed.createComponent(BookFilterComponent);
    const component = fixture.componentInstance;

    component.resetFilter$ = new Subject<void>();
    component.entity$ = of(null);
    component.entityType$ = of(EntityType.ALL_BOOKS);
    component.activeFilters = {library: [1]};

    expect(component.isFilterActive('library', '1')).toBe(true);
    expect(component.isFilterActive('library', 1)).toBe(true);
  });
});