import {inject, Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {BehaviorSubject, Observable} from 'rxjs';
import {tap} from 'rxjs/operators';
import {API_CONFIG} from '../../../core/config/api-config';
import {AuthorSummary, AuthorDetails, AuthorSearchResult, AuthorMatchRequest, AuthorUpdateRequest, AuthorPhotoResult} from '../model/author.model';
import {AuthService} from '../../../shared/service/auth.service';
import {SseStreamService} from '../../../shared/service/sse-stream.service';

@Injectable({
  providedIn: 'root'
})
export class AuthorService {

  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private sseStreamService = inject(SseStreamService);
  private readonly baseUrl = `${API_CONFIG.BASE_URL}/api/v1/authors`;
  private readonly mediaBaseUrl = `${API_CONFIG.BASE_URL}/api/v1/media`;

  private allAuthorsSubject = new BehaviorSubject<AuthorSummary[] | null>(null);
  allAuthors$ = this.allAuthorsSubject.asObservable();

  getAllAuthors(): Observable<AuthorSummary[]> {
    return this.http.get<AuthorSummary[]>(this.baseUrl).pipe(
      tap(authors => this.allAuthorsSubject.next(authors))
    );
  }

  getAuthorDetails(authorId: number): Observable<AuthorDetails> {
    return this.http.get<AuthorDetails>(`${this.baseUrl}/${authorId}`);
  }

  getAuthorByName(name: string): Observable<AuthorDetails> {
    return this.http.get<AuthorDetails>(`${this.baseUrl}/by-name`, {params: {name}});
  }

  searchAuthorMetadata(authorId: number, query: string, region: string, asin?: string): Observable<AuthorSearchResult[]> {
    const params: Record<string, string> = {region};
    if (asin) {
      params['asin'] = asin;
    } else {
      params['q'] = query;
    }
    return this.http.get<AuthorSearchResult[]>(`${this.baseUrl}/${authorId}/search-metadata`, {params});
  }

  matchAuthor(authorId: number, request: AuthorMatchRequest): Observable<AuthorDetails> {
    return this.http.post<AuthorDetails>(`${this.baseUrl}/${authorId}/match`, request);
  }

  quickMatchAuthor(authorId: number, region = 'us'): Observable<AuthorDetails> {
    return this.http.post<AuthorDetails>(`${this.baseUrl}/${authorId}/quick-match`, null, {
      params: {region}
    });
  }

  autoMatchAuthors(authorIds: number[]): Observable<AuthorSummary> {
    const token = this.authService.getInternalAccessToken();

    return this.sseStreamService.streamJson<AuthorSummary>(
      `${this.baseUrl}/auto-match`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: authorIds
      }
    );
  }

  updateAuthor(authorId: number, request: AuthorUpdateRequest): Observable<AuthorDetails> {
    return this.http.put<AuthorDetails>(`${this.baseUrl}/${authorId}`, request);
  }

  unmatchAuthors(authorIds: number[]): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/unmatch`, authorIds);
  }

  deleteAuthors(authorIds: number[]): Observable<void> {
    return this.http.delete<void>(this.baseUrl, {body: authorIds});
  }

  searchAuthorPhotos(authorId: number, query: string): Observable<AuthorPhotoResult[]> {
    return this.http.get<AuthorPhotoResult[]>(`${this.baseUrl}/${authorId}/search-photos`, {
      params: {q: query}
    });
  }

  uploadAuthorPhotoFromUrl(authorId: number, imageUrl: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${authorId}/photo/url`, null, {
      params: {url: imageUrl}
    });
  }

  getUploadAuthorPhotoUrl(authorId: number): string {
    return `${this.baseUrl}/${authorId}/photo/upload`;
  }

  getAuthorPhotoUrl(authorId: number): string {
    const token = this.authService.getInternalAccessToken();
    let url = `${this.mediaBaseUrl}/author/${authorId}/photo`;
    if (token) {
      url += `?token=${token}`;
    }
    return url;
  }

  getAuthorThumbnailUrl(authorId: number, cacheBuster?: number): string {
    const token = this.authService.getInternalAccessToken();
    let url = `${this.mediaBaseUrl}/author/${authorId}/thumbnail`;
    if (token) {
      url += `?token=${token}`;
    }
    if (cacheBuster) {
      url += (token ? '&' : '?') + 't=' + cacheBuster;
    }
    return url;
  }
}
