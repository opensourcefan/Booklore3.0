import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {By} from '@angular/platform-browser';
import {BehaviorSubject} from 'rxjs';
import {CdkDrag, CdkDragHandle, CdkDropList} from '@angular/cdk/drag-drop';

import {ToolbarEditorComponent} from './toolbar-editor.component';
import {ToolbarConfigService, ToolbarItem} from './toolbar-config.service';
import {UserService} from '../../../../features/settings/user-management/user.service';
import {DeviceBreakpoint, MobileUxService} from '../../../../core/services/mobile-ux.service';

describe('ToolbarEditorComponent drag reorder', () => {
  let config: ToolbarConfigService;

  beforeEach(async () => {
    localStorage.clear();
    const breakpoint$ = new BehaviorSubject<DeviceBreakpoint>('desktop');

    await TestBed.configureTestingModule({
      imports: [ToolbarEditorComponent],
      providers: [
        ToolbarConfigService,
        {
          provide: UserService,
          useValue: {
            getCurrentUser: () => ({
              id: 1,
              permissions: {admin: true},
              userSettings: {}
            }),
            updateUserSetting: vi.fn()
          }
        },
        {
          provide: MobileUxService,
          useValue: {
            breakpoint$,
            get isPhone() {
              return false;
            },
            get isTablet() {
              return false;
            },
            get isDesktop() {
              return true;
            }
          }
        }
      ]
    }).compileComponents();

    config = TestBed.inject(ToolbarConfigService);
  });

  function createFixture() {
    const fixture = TestBed.createComponent(ToolbarEditorComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('wires CDK drop-list / drag / handle directives (touch-capable reorder)', () => {
    const fixture = createFixture();
    const root = fixture.debugElement;

    expect(root.query(By.directive(CdkDropList))).toBeTruthy();
    expect(root.queryAll(By.directive(CdkDrag)).length).toBeGreaterThan(1);
    expect(root.queryAll(By.directive(CdkDragHandle)).length).toBeGreaterThan(1);

    const handle = root.query(By.css('.drag-handle'));
    expect(handle).toBeTruthy();
    expect(getComputedStyle(handle.nativeElement).touchAction).toBe('none');

    // Native HTML5 DnD must not be used — it is a no-op on touch tablets.
    const items = root.queryAll(By.css('.toolbar-editor-item'));
    expect(items.length).toBeGreaterThan(1);
    for (const item of items) {
      expect(item.nativeElement.getAttribute('draggable')).not.toBe('true');
    }
  });

  it('reorders draft items on CDK drop', () => {
    const fixture = createFixture();
    const component = fixture.componentInstance;
    const before = component.draftItems.map(item => item.id);
    expect(before.length).toBeGreaterThan(2);

    component.onDrop({
      previousIndex: 0,
      currentIndex: 2,
      item: null,
      container: null,
      previousContainer: null,
      isPointerOverContainer: true,
      distance: {x: 0, y: 0},
      dropPoint: {x: 0, y: 0},
      event: new MouseEvent('mouseup')
    } as never);

    const after = component.draftItems.map(item => item.id);
    expect(after[2]).toBe(before[0]);
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[2]);
  });

  it('persists reordered draft when Save is clicked', () => {
    const fixture = createFixture();
    const component = fixture.componentInstance;
    const firstId = component.draftItems[0].id;

    component.onDrop({
      previousIndex: 0,
      currentIndex: 1,
      item: null,
      container: null,
      previousContainer: null,
      isPointerOverContainer: true,
      distance: {x: 0, y: 0},
      dropPoint: {x: 0, y: 0},
      event: new MouseEvent('mouseup')
    } as never);

    const saveSpy = vi.spyOn(config, 'save');
    fixture.nativeElement.querySelector('.save-btn').click();
    fixture.detectChanges();

    expect(saveSpy).toHaveBeenCalled();
    expect(config.items[1].id).toBe(firstId);
  });

  it('keeps eye toggle clickable without requiring a drag gesture', () => {
    const fixture = createFixture();
    const component = fixture.componentInstance;
    const buttonItem = component.draftItems.find(item => item.type === 'button') as ToolbarItem;
    const wasVisible = buttonItem.visible;

    const toggle = fixture.debugElement.query(By.css('.toggle-btn'));
    expect(toggle).toBeTruthy();
    toggle.nativeElement.click();
    fixture.detectChanges();

    expect(buttonItem.visible).toBe(!wasVisible);
  });

  it('exposes isDragging while a CDK drag is active so the host popover can stay open', () => {
    const fixture = createFixture();
    const component = fixture.componentInstance;
    expect(component.isDragging).toBe(false);

    const drag = fixture.debugElement.query(By.directive(CdkDrag));
    drag.triggerEventHandler('cdkDragStarted', {});
    fixture.detectChanges();
    expect(component.isDragging).toBe(true);

    drag.triggerEventHandler('cdkDragEnded', {});
    fixture.detectChanges();
    expect(component.isDragging).toBe(false);
  });
});
