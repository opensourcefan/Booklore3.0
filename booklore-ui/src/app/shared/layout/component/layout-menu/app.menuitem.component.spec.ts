import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {BehaviorSubject, of, Subject} from 'rxjs';
import {provideRouter} from '@angular/router';
import {provideNoopAnimations} from '@angular/platform-browser/animations';
import {By} from '@angular/platform-browser';
import {CdkDrag} from '@angular/cdk/drag-drop';

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

  function createRootWithChildrenFixture(reorderMode: boolean) {
    const fixture = TestBed.createComponent(AppMenuitemComponent);

    fixture.componentRef.setInput('item', {
      label: 'Libraries',
      hasDropDown: true,
      items: [
        {
          label: 'Library A',
          type: 'Library',
          routerLink: ['/library/1'],
        },
        {
          label: 'Library B',
          type: 'Library',
          routerLink: ['/library/2'],
        },
      ],
    });
    fixture.componentRef.setInput('index', 0);
    fixture.componentRef.setInput('root', true);
    fixture.componentRef.setInput('parentKey', 'library');
    fixture.componentRef.setInput('menuKey', 'library');
    fixture.componentRef.setInput('reorderMode', reorderMode);

    fixture.detectChanges();
    return fixture;
  }

  it('does not render the interactive entity menu button for the /not-shelfed route item', () => {
    const fixture = createUnshelvedFixture();

    expect(fixture.nativeElement.querySelector('.interactive-entity-menu-button')).toBeNull();
  });

  it('shows the count badge for the /not-shelfed route item with translated label text', () => {
    const fixture = createUnshelvedFixture();
    const badge = fixture.nativeElement.querySelector('.non-interactive-badge') as HTMLElement;

    expect(badge).not.toBeNull();
    expect(badge.textContent?.trim()).toBe('7');
  });

  it('updates the /not-shelfed badge text when the count observable emits again', async () => {
    const count$ = new BehaviorSubject<number>(7);
    const fixture = TestBed.createComponent(AppMenuitemComponent);

    fixture.componentRef.setInput('item', {
      label: 'Not Shelfed',
      type: 'Shelf',
      routerLink: ['/not-shelfed'],
      bookCount$: count$.asObservable(),
      showBookCount: true,
    });
    fixture.componentRef.setInput('index', 0);
    fixture.componentRef.setInput('root', false);
    fixture.componentRef.setInput('parentKey', 'shelf');
    fixture.componentRef.setInput('menuKey', 'shelf');
    fixture.componentRef.setInput('reorderMode', false);

    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('.non-interactive-badge') as HTMLElement).textContent?.trim()).toBe('7');

    count$.next(4);
    fixture.detectChanges();
    await fixture.whenStable();

    expect((fixture.nativeElement.querySelector('.non-interactive-badge') as HTMLElement).textContent?.trim()).toBe('4');
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

  it('does not render child row drag directives while reorder mode is off', () => {
    const fixture = createRootWithChildrenFixture(false);

    const dragRows = fixture.debugElement.queryAll(By.directive(CdkDrag));
    expect(dragRows.length).toBe(0);
  });

  it('renders child row drag directives when reorder mode is enabled', () => {
    const fixture = createRootWithChildrenFixture(true);

    const dragRows = fixture.debugElement.queryAll(By.directive(CdkDrag));
    expect(dragRows.length).toBeGreaterThan(0);
  });

  it('renders an inline end action button and triggers it without navigating the row', () => {
    const fixture = TestBed.createComponent(AppMenuitemComponent);
    const endActionCommand = vi.fn();

    fixture.componentRef.setInput('item', {
      label: 'Dashboard',
      routerLink: ['/dashboard'],
      endActionIcon: 'pi pi-cog',
      endActionTooltip: 'Customize Dashboard',
      endActionAriaLabel: 'Customize Dashboard',
      endActionClass: 'dashboard-row-end-action',
      endActionCommand,
    });
    fixture.componentRef.setInput('index', 0);
    fixture.componentRef.setInput('root', false);
    fixture.componentRef.setInput('parentKey', 'home');
    fixture.componentRef.setInput('menuKey', 'home');
    fixture.componentRef.setInput('reorderMode', false);

    fixture.detectChanges();

    const actionButton = fixture.nativeElement.querySelector('.sidebar-row-end-action') as HTMLButtonElement;

    expect(actionButton).not.toBeNull();
    expect(actionButton.classList.contains('dashboard-row-end-action')).toBe(true);

    actionButton.click();

    expect(endActionCommand).toHaveBeenCalledTimes(1);
  });
});
