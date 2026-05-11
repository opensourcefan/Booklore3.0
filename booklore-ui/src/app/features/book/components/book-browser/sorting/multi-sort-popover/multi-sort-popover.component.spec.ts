import {ComponentFixture, TestBed} from '@angular/core/testing';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {Popover} from 'primeng/popover';
import {SortDirection} from '../../../../model/sort.model';
import {MultiSortPopoverComponent} from './multi-sort-popover.component';

describe('MultiSortPopoverComponent', () => {
  let fixture: ComponentFixture<MultiSortPopoverComponent>;
  let component: MultiSortPopoverComponent;
  let popover: {hide: ReturnType<typeof vi.fn>};

  beforeEach(async () => {
    popover = {
      hide: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [
        MultiSortPopoverComponent,
        TranslocoTestingModule.forRoot({langs: {}}),
      ],
      providers: [
        {provide: Popover, useValue: popover},
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MultiSortPopoverComponent);
    component = fixture.componentInstance;
    component.sortCriteria = [{field: 'title', label: 'Title', direction: SortDirection.ASCENDING}];
    component.availableSortOptions = [
      {field: 'title', label: 'Title', direction: SortDirection.ASCENDING},
      {field: 'author', label: 'Author', direction: SortDirection.ASCENDING},
    ];
    component.showSaveButton = true;
    fixture.detectChanges();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    fixture?.destroy();
  });

  it('hides the parent popover after saving the current sort config', () => {
    const saveEmitSpy = vi.spyOn(component.saveSortConfig, 'emit');
    const saveButton = fixture.nativeElement.querySelector('.save-sort-section button') as HTMLButtonElement;

    saveButton.click();

    expect(saveEmitSpy).toHaveBeenCalledWith(component.sortCriteria);
    expect(popover.hide).toHaveBeenCalledTimes(1);
  });

  it('closes the popover when focus leaves the sort editor', async () => {
    component.closeOnFocusOut = true;
    fixture.detectChanges();

    const outsideButton = document.createElement('button');
    document.body.appendChild(outsideButton);
    outsideButton.focus();

    const container = fixture.nativeElement.querySelector('.multi-sort-container') as HTMLElement;
    const focusOutEvent = new FocusEvent('focusout', {bubbles: true});
    Object.defineProperty(focusOutEvent, 'relatedTarget', {value: outsideButton});

    container.dispatchEvent(focusOutEvent);
    await Promise.resolve();

    expect(popover.hide).toHaveBeenCalledTimes(1);
  });

  it('keeps the popover open while focus moves into the sort-field select overlay', async () => {
    component.closeOnFocusOut = true;
    fixture.detectChanges();

    const selectOverlay = document.createElement('div');
    selectOverlay.className = 'p-select-overlay';
    const overlayOption = document.createElement('button');
    selectOverlay.appendChild(overlayOption);
    document.body.appendChild(selectOverlay);
    overlayOption.focus();

    const container = fixture.nativeElement.querySelector('.multi-sort-container') as HTMLElement;
    const focusOutEvent = new FocusEvent('focusout', {bubbles: true});
    Object.defineProperty(focusOutEvent, 'relatedTarget', {value: overlayOption});

    container.dispatchEvent(focusOutEvent);
    await Promise.resolve();

    expect(popover.hide).not.toHaveBeenCalled();
  });
});