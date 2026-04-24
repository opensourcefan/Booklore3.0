import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {of, Subject} from 'rxjs';
import {provideRouter} from '@angular/router';
import {provideNoopAnimations} from '@angular/platform-browser/animations';

import {AppMenuitemComponent} from './app.menuitem.component';
import {MenuService} from './service/app.menu.service';
import {UserService} from '../../../../features/settings/user-management/user.service';
import {DialogLauncherService} from '../../../services/dialog-launcher.service';
import {BookDialogHelperService} from '../../../../features/book/components/book-browser/book-dialog-helper.service';
import {LocalStorageService} from '../../../service/local-storage.service';
import {ThumbnailPrefetchService} from '../../../../features/book/service/thumbnail-prefetch.service';
import {DirectoryFilterService} from '../../../../features/book/service/directory-filter.service';

describe('AppMenuitemComponent unshelved row badge behavior', () => {
  beforeEach(async () => {
    const menuSource$ = new Subject<{key: string; routeEvent?: boolean}>();
    const resetSource$ = new Subject<void>();

    await TestBed.configureTestingModule({
      imports: [AppMenuitemComponent],
      providers: [
        provideRouter([]),
        provideNoopAnimations(),
        {
          provide: MenuService,
          useValue: {
            menuSource$: menuSource$.asObservable(),
            resetSource$: resetSource$.asObservable(),
            onMenuStateChange: vi.fn(),
          },
        },
        {
          provide: UserService,
          useValue: {
            userState$: of({
              user: {
                permissions: {
                  canManageLibrary: false,
                  admin: false,
                },
              },
            }),
          },
        },
        {
          provide: DialogLauncherService,
          useValue: {
            openLibraryCreateDialog: vi.fn(),
            openMagicShelfCreateDialog: vi.fn(),
          },
        },
        {
          provide: BookDialogHelperService,
          useValue: {
            openShelfCreatorDialog: vi.fn(),
          },
        },
        {
          provide: LocalStorageService,
          useValue: {
            set: vi.fn(),
            get: vi.fn(),
          },
        },
        {
          provide: ThumbnailPrefetchService,
          useValue: {
            prefetchLibrary: vi.fn(),
          },
        },
        {
          provide: DirectoryFilterService,
          useValue: {
            clearScope: vi.fn(),
            getScopeKeyFromUrl: vi.fn().mockReturnValue('scope'),
          },
        },
      ],
    }).compileComponents();
  });

  function createUnshelvedFixture() {
    const fixture = TestBed.createComponent(AppMenuitemComponent);

    fixture.componentRef.setInput('item', {
      label: 'Not Shelfed',
      type: 'Shelf',
      routerLink: ['/not-shelfed'],
      bookCount$: of(7),
      menu: [{label: 'Edit'}],
    });
    fixture.componentRef.setInput('index', 0);
    fixture.componentRef.setInput('root', false);
    fixture.componentRef.setInput('parentKey', 'shelf');
    fixture.componentRef.setInput('menuKey', 'shelf');
    fixture.componentRef.setInput('reorderMode', false);

    fixture.detectChanges();
    return fixture;
  }

  it('does not render the entity menu button for the /not-shelfed route item', () => {
    const fixture = createUnshelvedFixture();

    expect(fixture.nativeElement.querySelector('.entity-menu-button')).toBeNull();
  });

  it('shows the count badge for the /not-shelfed route item with translated label text', () => {
    const fixture = createUnshelvedFixture();
    const badge = fixture.nativeElement.querySelector('.book-count') as HTMLElement;

    expect(badge).not.toBeNull();
    expect(badge.textContent?.trim()).toBe('7');
  });

  it('stops bubbling click events when touch interaction is treated as a swipe', () => {
    const fixture = createUnshelvedFixture();
    const component = fixture.componentInstance;
    const clickEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as Event;

    component.onTouchStart({
      touches: [{clientX: 10, clientY: 10}],
    } as unknown as TouchEvent);
    component.onTouchEnd({
      changedTouches: [{clientX: 28, clientY: 10}],
    } as unknown as TouchEvent);

    component.triggerLink(clickEvent);

    expect(clickEvent.preventDefault).toHaveBeenCalled();
    expect(clickEvent.stopPropagation).toHaveBeenCalled();
  });

  it('stops bubbling click events while reorder mode is active', () => {
    const fixture = createUnshelvedFixture();
    const component = fixture.componentInstance;
    const clickEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as Event;

    component.reorderMode = true;
    component.triggerLink(clickEvent);

    expect(clickEvent.preventDefault).toHaveBeenCalled();
    expect(clickEvent.stopPropagation).toHaveBeenCalled();
  });
});
