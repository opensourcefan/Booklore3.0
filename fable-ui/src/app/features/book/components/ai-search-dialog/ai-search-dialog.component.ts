import {Component, inject, OnDestroy} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {InputTextModule} from 'primeng/inputtext';
import {Button} from 'primeng/button';
import {DialogModule} from 'primeng/dialog';
import {Skeleton} from 'primeng/skeleton';
import {SlicePipe} from '@angular/common';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {AppSettingsService} from '../../../../shared/service/app-settings.service';
import {UserService} from '../../../settings/user-management/user.service';
import {UrlHelperService} from '../../../../shared/service/url-helper.service';
import {Router} from '@angular/router';
import {AiSearchChunkResult} from '../../../../shared/model/app-settings.model';
import {Subscription} from 'rxjs';

@Component({
  selector: 'app-ai-search-dialog',
  templateUrl: './ai-search-dialog.component.html',
  styleUrls: ['./ai-search-dialog.component.scss'],
  imports: [
    FormsModule,
    InputTextModule,
    Button,
    DialogModule,
    Skeleton,
    SlicePipe,
    TranslocoDirective,
  ],
  standalone: true
})
export class AiSearchDialogComponent implements OnDestroy {
  visible = false;
  searchQuery = '';
  results: AiSearchChunkResult[] = [];
  isLoading = false;
  hasSearched = false;
  answer: string | null = null;

  private appSettingsService = inject(AppSettingsService);
  private userService = inject(UserService);
  protected urlHelper = inject(UrlHelperService);
  private router = inject(Router);
  private readonly t = inject(TranslocoService);

  private searchSub?: Subscription;

  open(): void {
    this.visible = true;
    this.searchQuery = '';
    this.results = [];
    this.hasSearched = false;
    this.answer = null;
  }

  close(): void {
    this.visible = false;
  }

  onSearch(): void {
    const query = this.searchQuery.trim();
    if (query.length < 2) {
      return;
    }

    this.isLoading = true;
    this.hasSearched = true;
    this.answer = null;

    const user = this.userService.getCurrentUser();
    if (!user) {
      this.isLoading = false;
      return;
    }

    this.searchSub = this.appSettingsService.searchWithAi(query, [], user.id).subscribe({
      next: (result) => {
        this.isLoading = false;
        this.results = result.results || [];
        this.answer = result.answer || null;
      },
      error: () => {
        this.isLoading = false;
        this.results = [];
      },
    });
  }

  onResultClick(result: AiSearchChunkResult): void {
    this.close();
    this.router.navigate(['/book', result.bookId], {
      queryParams: {tab: 'view', returnTo: this.router.url}
    });
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.onSearch();
    }
  }

  ngOnDestroy(): void {
    this.searchSub?.unsubscribe();
  }
}
