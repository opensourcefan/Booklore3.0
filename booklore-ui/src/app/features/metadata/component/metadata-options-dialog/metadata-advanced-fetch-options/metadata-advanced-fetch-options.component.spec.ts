import {SimpleChange} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {MessageService} from 'primeng/api';

import {MetadataAdvancedFetchOptionsComponent} from './metadata-advanced-fetch-options.component';
import {MetadataRefreshOptions} from '../../../model/request/metadata-refresh-options.model';

describe('MetadataAdvancedFetchOptionsComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        MetadataAdvancedFetchOptionsComponent,
        TranslocoTestingModule.forRoot({
          langs: {en: {}},
          translocoConfig: {
            availableLangs: ['en'],
            defaultLang: 'en',
          },
        }),
      ],
      providers: [
        {
          provide: MessageService,
          useValue: {
            add: vi.fn(),
          },
        },
      ],
    }).compileComponents();
  });

  function createComponent(): MetadataAdvancedFetchOptionsComponent {
    const fixture = TestBed.createComponent(MetadataAdvancedFetchOptionsComponent);
    return fixture.componentInstance;
  }

  it('defaults merge genres off and manual review on when settings omit those flags', () => {
    const component = createComponent();
    component.currentMetadataOptions = {
      libraryId: null,
      refreshCovers: false,
      replaceMode: 'REPLACE_MISSING',
      fieldOptions: undefined,
      enabledFields: undefined,
    } as MetadataRefreshOptions;

    component.ngOnChanges({
      currentMetadataOptions: new SimpleChange(null, component.currentMetadataOptions, true),
    });

    expect(component.mergeCategories).toBe(false);
    expect(component.reviewBeforeApply).toBe(true);
  });

  it('reset restores merge genres off and manual review on', () => {
    const component = createComponent();
    component.mergeCategories = true;
    component.reviewBeforeApply = false;
    component.refreshCovers = true;

    component.reset();

    expect(component.mergeCategories).toBe(false);
    expect(component.reviewBeforeApply).toBe(true);
    expect(component.refreshCovers).toBe(false);
  });

  it('renders the footer control rail above table content', () => {
    const fixture = TestBed.createComponent(MetadataAdvancedFetchOptionsComponent);
    fixture.componentInstance.submitButtonLabel = 'Start';
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const optionsContainer = root.querySelector('.options-container') as HTMLElement;
    const controlRail = optionsContainer.querySelector('.footer-row') as HTMLElement;
    const table = optionsContainer.querySelector('.custom-table') as HTMLElement;

    expect(controlRail).not.toBeNull();
    expect(optionsContainer.firstElementChild).toBe(controlRail);
    expect(table).not.toBeNull();
  });

  it('hides the embedded footer controls when external controls are enabled', () => {
    const fixture = TestBed.createComponent(MetadataAdvancedFetchOptionsComponent);
    fixture.componentInstance.submitButtonLabel = 'Start';
    fixture.componentInstance.showEmbeddedControls = false;
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const optionsContainer = root.querySelector('.options-container') as HTMLElement;
    const controlRail = optionsContainer.querySelector('.footer-row') as HTMLElement | null;
    const table = optionsContainer.querySelector('.custom-table') as HTMLElement;

    expect(controlRail).toBeNull();
    expect(optionsContainer.classList.contains('options-container--external-controls')).toBe(true);
    expect(table).not.toBeNull();
  });
});