import {inject, Injectable} from '@angular/core';
import {Observable} from 'rxjs';
import {API_CONFIG} from '../../../core/config/api-config';
import {FetchMetadataRequest} from '../../metadata/model/request/fetch-metadata-request.model';
import {BookMetadata} from '../model/book.model';
import {AuthService} from '../../../shared/service/auth.service';
import {HttpClient} from '@angular/common/http';
import {SseStreamService} from '../../../shared/service/sse-stream.service';

@Injectable({providedIn: 'root'})
export class BookMetadataService {
  private readonly booksUrl = `${API_CONFIG.BASE_URL}/api/v1/books`;
  private readonly metadataUrl = `${API_CONFIG.BASE_URL}/api/v1/metadata`;
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private sseStreamService = inject(SseStreamService);

  fetchBookMetadata(bookId: number, request: FetchMetadataRequest): Observable<BookMetadata> {
    const token = this.authService.getInternalAccessToken();

    if (!token) {
      throw new Error('No authentication token available');
    }

    return this.sseStreamService.streamJson<BookMetadata>(
      `${this.booksUrl}/${bookId}/metadata/prospective`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: request,
      }
    );
  }

  fetchMetadataDetail(provider: string, providerItemId: string): Observable<BookMetadata> {
    return this.http.get<BookMetadata>(`${this.metadataUrl}/detail/${provider}/${providerItemId}`);
  }

  lookupByIsbn(isbn: string): Observable<BookMetadata> {
    return this.http.post<BookMetadata>(`${this.metadataUrl}/isbn-lookup`, {isbn});
  }
}
