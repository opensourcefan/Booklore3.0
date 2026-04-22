import {Component, inject, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {Subject, takeUntil} from 'rxjs';

import {MetadataRefreshType} from '../../model/request/metadata-refresh-type.enum';
import {MetadataRefreshOptions, MetadataReplaceMode} from '../../model/request/metadata-refresh-options.model';

import {DynamicDialogConfig, DynamicDialogRef} from 'primeng/dynamicdialog';
import {BookService} from '../../../book/service/book.service';
import {AppSettingsService} from '../../../../shared/service/app-settings.service';
import {Book} from '../../../book/model/book.model';
import {FormsModule} from '@angular/forms';
import {MetadataFetchOptionsComponent} from '../metadata-options-dialog/metadata-fetch-options/metadata-fetch-options.component';
import {Button} from 'primeng/button';
import {Checkbox} from 'primeng/checkbox';
import {Select} from 'primeng/select';
import {Tooltip} from 'primeng/tooltip';
import {TranslocoDirective} from '@jsverse/transloco';

@Component({
  selector: 'app-multi-book-metadata-fetch-component',
  standalone: true,
  templateUrl: './multi-book-metadata-fetch-component.html',
  styleUrl: './multi-book-metadata-fetch-component.scss',
  imports: [MetadataFetchOptionsComponent, FormsModule, Button, Checkbox, Select, Tooltip, TranslocoDirective],
})
export class MultiBookMetadataFetchComponent implements OnInit, OnDestroy {
  @ViewChild(MetadataFetchOptionsComponent)
  metadataFetchOptionsComponent?: MetadataFetchOptionsComponent;

  bookIds!: number[];
  booksToShow: Book[] = [];
  metadataRefreshType!: MetadataRefreshType;
  currentMetadataOptions!: MetadataRefreshOptions;

  private destroy$ = new Subject<void>();

  private dynamicDialogConfig = inject(DynamicDialogConfig);
  dialogRef = inject(DynamicDialogRef);
  private bookService = inject(BookService);
  private appSettingsService = inject(AppSettingsService);
  expanded = false;

  ngOnInit(): void {
    this.bookIds = this.dynamicDialogConfig.data.bookIds;
    this.metadataRefreshType = this.dynamicDialogConfig.data.metadataRefreshType;

    this.booksToShow = this.bookService.getBooksByIdsFromState(this.bookIds);

    this.appSettingsService.appSettings$
      .pipe(takeUntil(this.destroy$))
      .subscribe(settings => {
        this.currentMetadataOptions = settings!.defaultMetadataRefreshOptions;
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get advancedOptionsReady(): boolean {
    return this.metadataFetchOptionsComponent?.advancedOptionsReady ?? false;
  }

  get replaceModeOptions(): {label: string; value: MetadataReplaceMode}[] {
    return this.metadataFetchOptionsComponent?.replaceModeOptions ?? [];
  }

  get replaceMode(): MetadataReplaceMode {
    return this.metadataFetchOptionsComponent?.replaceMode ?? 'REPLACE_MISSING';
  }

  set replaceMode(value: MetadataReplaceMode) {
    if (this.metadataFetchOptionsComponent) {
      this.metadataFetchOptionsComponent.replaceMode = value;
    }
  }

  get refreshCovers(): boolean {
    return this.metadataFetchOptionsComponent?.refreshCovers ?? false;
  }

  set refreshCovers(value: boolean) {
    if (this.metadataFetchOptionsComponent) {
      this.metadataFetchOptionsComponent.refreshCovers = value;
    }
  }

  get mergeCategories(): boolean {
    return this.metadataFetchOptionsComponent?.mergeCategories ?? false;
  }

  set mergeCategories(value: boolean) {
    if (this.metadataFetchOptionsComponent) {
      this.metadataFetchOptionsComponent.mergeCategories = value;
    }
  }

  get reviewBeforeApply(): boolean {
    return this.metadataFetchOptionsComponent?.reviewBeforeApply ?? true;
  }

  set reviewBeforeApply(value: boolean) {
    if (this.metadataFetchOptionsComponent) {
      this.metadataFetchOptionsComponent.reviewBeforeApply = value;
    }
  }

  resetAdvancedOptions(): void {
    this.metadataFetchOptionsComponent?.resetAdvancedOptions();
  }

  submitAdvancedOptions(): void {
    this.metadataFetchOptionsComponent?.submitAdvancedOptions();
  }
}
