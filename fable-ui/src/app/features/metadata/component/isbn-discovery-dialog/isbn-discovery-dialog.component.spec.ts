import {TestBed} from '@angular/core/testing';
import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {IsbnDiscoveryDialogComponent, IsbnDiscoveryDialogData} from './isbn-discovery-dialog.component';

describe('IsbnDiscoveryDialogComponent', () => {
  const close = vi.fn();
  const config: {data: IsbnDiscoveryDialogData} = {
    data: {
      count: 2,
      providers: ['Amazon', 'Google', 'Hardcover'],
    },
  };

  beforeEach(() => {
    localStorage.clear();
    close.mockClear();
    TestBed.configureTestingModule({
      providers: [
        {provide: DynamicDialogConfig, useValue: config},
        {provide: DynamicDialogRef, useValue: {close}},
      ],
    });
  });

  function createComponent(): IsbnDiscoveryDialogComponent {
    return TestBed.runInInjectionContext(() => new IsbnDiscoveryDialogComponent());
  }

  it('defaults to all enabled providers and returns the selected subset', () => {
    const component = createComponent();
    expect(component.selectedProviders).toEqual(['Amazon', 'Google', 'Hardcover']);

    component.selectedProviders = ['Google', 'Hardcover'];
    component.confirm();

    expect(close).toHaveBeenCalledWith(['Google', 'Hardcover']);
  });

  it('filters remembered providers against currently enabled providers', () => {
    localStorage.setItem(
      'fable-isbn-discovery-providers',
      JSON.stringify(['DisabledProvider', 'Google'])
    );

    expect(createComponent().selectedProviders).toEqual(['Google']);
  });

  it('requires at least one provider', () => {
    const component = createComponent();
    component.selectedProviders = [];

    component.confirm();

    expect(component.canConfirm).toBe(false);
    expect(close).not.toHaveBeenCalled();
  });
});
