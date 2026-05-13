import {signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {beforeEach, describe, expect, it} from 'vitest';

import Aura from '../theme-palette-extend';
import {AppState} from '../../../model/app-state.model';
import {AppConfigService} from '../../../service/app-config.service';
import {ThemeConfiguratorComponent} from './theme-configurator.component';

type MockPalette = Record<string, string>;

class AppConfigServiceStub {
  readonly appState = signal<AppState>({preset: 'Aura', primary: 'green', surface: 'ash'});
  readonly surfaces = [
    {
      name: 'ash',
      palette: {
        0: '#ffffff',
        500: '#71808a',
      } as MockPalette,
    },
    {
      name: 'slate',
      palette: {
        0: '#ffffff',
        500: '#64748b',
      } as MockPalette,
    },
  ];

  clearCustomColor(area: 'primary' | 'surface'): void {
    this.appState.update((state) => {
      const updated = {...state};

      if (area === 'primary') {
        delete updated.customPrimaryColor;
        delete updated.customPrimaryGenerated;
      } else {
        delete updated.customSurfaceColor;
        delete updated.customSurfaceGenerated;
      }

      return updated;
    });
  }

  setCustomColor(area: 'primary' | 'surface', hex: string): void {
    this.appState.update((state) => ({
      ...state,
      ...(area === 'primary' ? {customPrimaryColor: hex} : {customSurfaceColor: hex}),
    }));
  }
}

describe('ThemeConfiguratorComponent preset sync', () => {
  const translations = {
    layout: {
      theme: {
        primary: 'Primary',
        surface: 'Surface',
        customColor: 'Custom Color',
        colorPlaceholder: 'Enter a color value',
        resetTooltip: 'Reset custom color',
      },
    },
  };

  let configService: AppConfigServiceStub;

  beforeEach(async () => {
    configService = new AppConfigServiceStub();

    await TestBed.configureTestingModule({
      imports: [
        ThemeConfiguratorComponent,
        TranslocoTestingModule.forRoot({
          langs: {en: translations},
          translocoConfig: {
            availableLangs: ['en'],
            defaultLang: 'en',
          },
        }),
      ],
      providers: [
        {provide: AppConfigService, useValue: configService},
      ],
    }).compileComponents();
  });

  it('resets the primary draft inputs to the clicked preset hex even when that preset is already active', () => {
    const fixture = TestBed.createComponent(ThemeConfiguratorComponent);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const primarySection = root.querySelectorAll('.config-panel-colors')[0] as HTMLElement;
    const textInput = primarySection.querySelector('input[type="text"]') as HTMLInputElement;
    const colorInput = primarySection.querySelector('input[type="color"]') as HTMLInputElement;
    const greenButton = primarySection.querySelector('button[title="green"]') as HTMLButtonElement;
    const expectedHex = ((Aura.primitive ?? {}) as Record<string, Record<string, string>>)['green']['500'];

    textInput.value = '#12345';
    textInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    greenButton.click();
    fixture.detectChanges();

    expect(textInput.value).toBe(expectedHex);
    expect(colorInput.value).toBe(expectedHex);
    expect(configService.appState().primary).toBe('green');
    expect(configService.appState().customPrimaryColor).toBeUndefined();
  });

  it('shows the selected surface preset hex in both the text input and native picker', () => {
    const fixture = TestBed.createComponent(ThemeConfiguratorComponent);
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const surfaceSection = root.querySelectorAll('.config-panel-colors')[1] as HTMLElement;
    const textInput = surfaceSection.querySelector('input[type="text"]') as HTMLInputElement;
    const colorInput = surfaceSection.querySelector('input[type="color"]') as HTMLInputElement;
    const slateButton = surfaceSection.querySelector('button[title="slate"]') as HTMLButtonElement;

    slateButton.click();
    fixture.detectChanges();

    expect(textInput.value).toBe('#64748b');
    expect(colorInput.value).toBe('#64748b');
    expect(configService.appState().surface).toBe('slate');
    expect(configService.appState().customSurfaceColor).toBeUndefined();
  });
});