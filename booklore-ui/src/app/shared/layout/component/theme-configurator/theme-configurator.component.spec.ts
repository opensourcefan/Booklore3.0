import {signal} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {TranslocoTestingModule} from '@jsverse/transloco';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {ThemeConfiguratorComponent} from './theme-configurator.component';
import {FaviconService} from './favicon-service';
import {AppConfigService} from '../../../service/app-config.service';
import {AppState} from '../../../model/app-state.model';
import {getRecentThemeColors, normalizeHexColor, ThemeColorType} from '../../../util/theme-color.util';

class MockAppConfigService {
  readonly surfaces = [
    {
      name: 'ash',
      palette: {
        500: '#71808a',
      },
    },
    {
      name: 'zinc',
      palette: {
        500: '#71717a',
      },
    },
  ];

  readonly appState = signal<AppState>({
    preset: 'Aura',
    primary: 'green',
    surface: 'ash',
    recentPrimaryColors: [],
    recentSurfaceColors: [],
  });

  setState(state: Partial<AppState>): void {
    this.appState.set({
      preset: 'Aura',
      primary: 'green',
      surface: 'ash',
      recentPrimaryColors: [],
      recentSurfaceColors: [],
      ...state,
    });
  }

  getThemeInputColor(type: ThemeColorType): string {
    const value = this.appState()[type];
    const normalized = normalizeHexColor(value ?? null);
    if (normalized) {
      return normalized;
    }

    return type === 'primary' ? '#22c55e' : '#71808a';
  }

  getRecentThemeColors(type: ThemeColorType): string[] {
    return type === 'primary'
      ? this.appState().recentPrimaryColors ?? []
      : this.appState().recentSurfaceColors ?? [];
  }

  setThemeSelection(type: ThemeColorType, value: string): void {
    const normalizedHex = normalizeHexColor(value);
    const nextValue = normalizedHex ?? value;

    this.appState.update((state) => {
      const nextState: AppState = {
        ...state,
        [type]: nextValue,
      };

      if (normalizedHex) {
        if (type === 'primary') {
          nextState.recentPrimaryColors = getRecentThemeColors(state.recentPrimaryColors, normalizedHex);
        } else {
          nextState.recentSurfaceColors = getRecentThemeColors(state.recentSurfaceColors, normalizedHex);
        }
      }

      return nextState;
    });
  }
}

describe('ThemeConfiguratorComponent', () => {
  let fixture: ComponentFixture<ThemeConfiguratorComponent>;
  let appConfigService: MockAppConfigService;
  let faviconService: { updateFavicon: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    appConfigService = new MockAppConfigService();
    faviconService = {
      updateFavicon: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [
        ThemeConfiguratorComponent,
        TranslocoTestingModule.forRoot({
          langs: {
            en: {
              layout: {
                theme: {
                  primary: 'Primary',
                  surface: 'Surface',
                },
              },
            },
          },
          translocoConfig: {
            availableLangs: ['en'],
            defaultLang: 'en',
          },
        }),
      ],
      providers: [
        {
          provide: AppConfigService,
          useValue: appConfigService,
        },
        {
          provide: FaviconService,
          useValue: faviconService,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ThemeConfiguratorComponent);
  });

  afterEach(() => {
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it('opens the hidden primary color input from the plus trigger and removes preset swatches after custom mode starts', () => {
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const primarySection = root.querySelector('.config-panel-colors--primary') as HTMLElement;
    const primaryInput = primarySection.querySelector('#theme-primary-picker') as HTMLInputElement;
    const primaryTrigger = primarySection.querySelector('.config-color-button--custom-trigger') as HTMLButtonElement;
    const inputClickSpy = vi.spyOn(primaryInput, 'click');

    expect(primarySection.querySelectorAll('.config-color-button--preset').length).toBeGreaterThan(0);

    primaryTrigger.click();
    fixture.detectChanges();

    expect(inputClickSpy).toHaveBeenCalledTimes(1);
    expect(primarySection.querySelectorAll('.config-color-button--preset')).toHaveLength(0);
  });

  it('renders recent primary and surface colors inside the main dropdown grids', () => {
    appConfigService.setState({
      primary: '#112233',
      surface: '#778899',
      recentPrimaryColors: ['#112233', '#445566'],
      recentSurfaceColors: ['#778899'],
    });

    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('.config-recent-colors')).toBeNull();
    expect(root.querySelectorAll('.config-panel-colors--primary .config-color-button--recent')).toHaveLength(2);
    expect(root.querySelectorAll('.config-panel-colors--surface .config-color-button--recent')).toHaveLength(1);
  });

  it('applies a recent primary color directly from the main grid', () => {
    appConfigService.setState({
      primary: '#445566',
      recentPrimaryColors: ['#112233', '#445566'],
    });

    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const targetButton = root.querySelector('.config-panel-colors--primary .config-color-button--recent[title="#112233"]') as HTMLButtonElement;

    targetButton.click();
    fixture.detectChanges();

    const activeButton = root.querySelector('.config-panel-colors--primary .config-color-button--recent.active-color') as HTMLButtonElement;

    expect(appConfigService.appState().primary).toBe('#112233');
    expect(activeButton.title).toBe('#112233');
  });
});