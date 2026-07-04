import {inject, Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {BehaviorSubject, Observable} from 'rxjs';
import {tap} from 'rxjs/operators';

import {StoryArcSummary, StoryArcBookMapping, StoryArcLayoutUpdateRequest, StoryArcBulkAddRequest, StoryArcMetadataDto} from '../model/story-arc.model';
import {API_CONFIG} from '../../../core/config/api-config';
import {SidebarBadgeRefreshService} from '../../book/service/sidebar-badge-refresh.service';

@Injectable({providedIn: 'root'})
export class StoryArcService {
  private readonly url = `${API_CONFIG.BASE_URL}/api/v1/story-arcs`;
  private http = inject(HttpClient);
  private sidebarBadgeRefresh = inject(SidebarBadgeRefreshService);

  private storyArcsSubject = new BehaviorSubject<StoryArcSummary[]>([]);
  private loaded = false;

  storyArcs$ = this.storyArcsSubject.asObservable();

  constructor() {
    this.sidebarBadgeRefresh.refresh$.subscribe(() => {
      this.reloadStoryArcs();
    });
  }

  loadStoryArcs(): void {
    if (this.loaded) return;
    this.reloadStoryArcs();
  }

  reloadStoryArcs(): void {
    this.http.get<StoryArcSummary[]>(this.url).subscribe({
      next: (arcs) => {
        this.storyArcsSubject.next(arcs);
        this.loaded = true;
      },
      error: () => {
        // Handled or ignored gracefully
      }
    });
  }

  getStoryArc(name: string): Observable<StoryArcBookMapping[]> {
    return this.http.get<StoryArcBookMapping[]>(`${this.url}/${encodeURIComponent(name)}`);
  }

  bulkAdd(request: StoryArcBulkAddRequest): Observable<void> {
    return this.http.post<void>(`${this.url}/bulk-add`, request).pipe(
      tap(() => {
        this.reloadStoryArcs();
        this.sidebarBadgeRefresh.requestRefresh();
      })
    );
  }

  saveLayout(name: string, request: StoryArcLayoutUpdateRequest): Observable<void> {
    return this.http.put<void>(`${this.url}/${encodeURIComponent(name)}/layout`, request).pipe(
      tap(() => {
        this.reloadStoryArcs();
        this.sidebarBadgeRefresh.requestRefresh();
      })
    );
  }

  deleteStoryArc(name: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${encodeURIComponent(name)}`).pipe(
      tap(() => {
        this.reloadStoryArcs();
        this.sidebarBadgeRefresh.requestRefresh();
      })
    );
  }

  removeBooksFromStoryArc(name: string, bookIds: number[]): Observable<void> {
    const params = { bookIds: bookIds.join(',') };
    return this.http.delete<void>(`${this.url}/${encodeURIComponent(name)}/books`, { params }).pipe(
      tap(() => {
        this.reloadStoryArcs();
        this.sidebarBadgeRefresh.requestRefresh();
      })
    );
  }

  getStoryArcStats(): Observable<StoryArcSummary[]> {
    return this.http.get<StoryArcSummary[]>(`${API_CONFIG.BASE_URL}/api/v1/user-stats/story-arcs`);
  }

  fetchWebMetadata(url: string): Observable<StoryArcMetadataDto> {
    return this.http.post<StoryArcMetadataDto>(`${this.url}/fetch-metadata`, { url });
  }

  setCoverBook(name: string, coverBookId: number | null): Observable<void> {
    return this.http.put<void>(`${this.url}/${encodeURIComponent(name)}/cover`, { coverBookId }).pipe(
      tap(() => {
        this.reloadStoryArcs();
      })
    );
  }
}
