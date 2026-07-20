import {Component, inject, OnInit} from '@angular/core';
import {MetadataProviderSettingsComponent} from '../global-preferences/metadata-provider-settings/metadata-provider-settings.component';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {MetadataRefreshOptions} from '../../metadata/model/request/metadata-refresh-options.model';
import {AppSettingsService} from '../../../shared/service/app-settings.service';
import {SettingsHelperService} from '../../../shared/service/settings-helper.service';
import {Observable} from 'rxjs';
import {AppSettingKey, AppSettings} from '../../../shared/model/app-settings.model';
import {filter, take} from 'rxjs/operators';
import {ToggleSwitch} from 'primeng/toggleswitch';
import {InputNumber} from 'primeng/inputnumber';
import {MetadataMatchWeightsComponent} from '../global-preferences/metadata-match-weights/metadata-match-weights-component';
import {MetadataPersistenceSettingsComponent} from './metadata-persistence-settings/metadata-persistence-settings-component';
import {PublicReviewsSettingsComponent} from './public-reviews-settings/public-reviews-settings-component';
import {MetadataProviderFieldSelectorComponent} from '../../metadata/component/metadata-provider-field-selector/metadata-provider-field-selector.component';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';

@Component({
  selector: 'app-metadata-settings-component',
  standalone: true,
  imports: [
    MetadataProviderSettingsComponent,
    ReactiveFormsModule,
    FormsModule,
    MetadataMatchWeightsComponent,
    ToggleSwitch,
    InputNumber,
    MetadataPersistenceSettingsComponent,
    PublicReviewsSettingsComponent,
    MetadataProviderFieldSelectorComponent,
    TranslocoDirective
  ],
  templateUrl: './metadata-settings-component.html',
  styleUrl: './metadata-settings-component.scss'
})
export class MetadataSettingsComponent implements OnInit {

  currentMetadataOptions!: MetadataRefreshOptions;
  metadataDownloadOnBookdrop = true;

  isbnDiscoveryEnabled = false;
  isbnDiscoveryOnBookdrop = true;
  isbnDiscoveryOnLibraryScan = false;
  maxFrontMatterPages = 8;
  useOcrForIsbnDiscovery = true;
  isbnFetchReviewBeforeApply = false;
  isbnFileWriteBackEnabled = false;

  private readonly appSettingsService = inject(AppSettingsService);
  private readonly settingsHelper = inject(SettingsHelperService);
  private t = inject(TranslocoService);

  readonly appSettings$: Observable<AppSettings | null> = this.appSettingsService.appSettings$;

  ngOnInit(): void {
    this.loadSettings();
  }

  onMetadataDownloadOnBookdropToggle(checked: boolean): void {
    this.metadataDownloadOnBookdrop = checked;
    this.settingsHelper.saveSetting(AppSettingKey.METADATA_DOWNLOAD_ON_BOOKDROP, checked);
  }

  onIsbnDiscoveryEnabledToggle(checked: boolean): void {
    this.isbnDiscoveryEnabled = checked;
    this.settingsHelper.saveSetting(AppSettingKey.ISBN_DISCOVERY_ENABLED, checked);
  }

  onIsbnDiscoveryOnBookdropToggle(checked: boolean): void {
    this.isbnDiscoveryOnBookdrop = checked;
    this.settingsHelper.saveSetting(AppSettingKey.ISBN_DISCOVERY_ON_BOOKDROP, checked);
  }

  onIsbnDiscoveryOnLibraryScanToggle(checked: boolean): void {
    this.isbnDiscoveryOnLibraryScan = checked;
    this.settingsHelper.saveSetting(AppSettingKey.ISBN_DISCOVERY_ON_LIBRARY_SCAN, checked);
  }

  onUseOcrForIsbnDiscoveryToggle(checked: boolean): void {
    this.useOcrForIsbnDiscovery = checked;
    this.settingsHelper.saveSetting(AppSettingKey.USE_OCR_FOR_ISBN_DISCOVERY, checked);
  }

  onIsbnFetchReviewBeforeApplyToggle(checked: boolean): void {
    this.isbnFetchReviewBeforeApply = checked;
    this.settingsHelper.saveSetting(AppSettingKey.ISBN_FETCH_REVIEW_BEFORE_APPLY, checked);
  }

  onIsbnFileWriteBackEnabledToggle(checked: boolean): void {
    this.isbnFileWriteBackEnabled = checked;
    this.settingsHelper.saveSetting(AppSettingKey.ISBN_FILE_WRITE_BACK_ENABLED, checked);
  }

  onMaxFrontMatterPagesChange(value: number | null): void {
    const pages = value && value > 0 ? value : 8;
    this.maxFrontMatterPages = pages;
    this.settingsHelper.saveSetting(AppSettingKey.MAX_FRONT_MATTER_PAGES, pages);
  }

  onMetadataSubmit(metadataRefreshOptions: MetadataRefreshOptions): void {
    this.currentMetadataOptions = metadataRefreshOptions;
    this.settingsHelper.saveSetting(AppSettingKey.QUICK_BOOK_MATCH, metadataRefreshOptions);
  }

  private loadSettings(): void {
    this.appSettings$.pipe(
      filter((settings): settings is AppSettings => !!settings),
      take(1)
    ).subscribe({
      next: (settings) => this.initializeSettings(settings),
      error: (error) => {
        console.error('Failed to load settings:', error);
        this.settingsHelper.showMessage('error', this.t.translate('common.error'), this.t.translate('settingsMeta.autoDownload.loadError'));
      }
    });
  }

  private initializeSettings(settings: AppSettings): void {
    if (settings.defaultMetadataRefreshOptions) {
      this.currentMetadataOptions = settings.defaultMetadataRefreshOptions;
    }

    this.metadataDownloadOnBookdrop = settings.metadataDownloadOnBookdrop ?? true;
    this.isbnDiscoveryEnabled = settings.isbnDiscoveryEnabled ?? false;
    this.isbnDiscoveryOnBookdrop = settings.isbnDiscoveryOnBookdrop ?? true;
    this.isbnDiscoveryOnLibraryScan = settings.isbnDiscoveryOnLibraryScan ?? false;
    this.maxFrontMatterPages = settings.maxFrontMatterPages ?? 8;
    this.useOcrForIsbnDiscovery = settings.useOcrForIsbnDiscovery ?? true;
    this.isbnFetchReviewBeforeApply = settings.isbnFetchReviewBeforeApply ?? false;
    this.isbnFileWriteBackEnabled = settings.isbnFileWriteBackEnabled ?? false;
  }
}
