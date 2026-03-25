import {inject, Injectable} from '@angular/core';
import {HttpClient, HttpResponse} from '@angular/common/http';
import {Observable, of, throwError} from 'rxjs';
import {catchError, map} from 'rxjs/operators';

import {API_CONFIG} from '../../core/config/api-config';

export interface ComicPanelFlowResponse {
  data: string;
}

@Injectable({providedIn: 'root'})
export class ComicPanelFlowService {
  private http = inject(HttpClient);
  private readonly apiUrl = `${API_CONFIG.BASE_URL}/api/v1/ai/panel-flow`;

  getPanelFlow(bookId: number): Observable<ComicPanelFlowResponse | null> {
    return this.http.get<ComicPanelFlowResponse>(`${this.apiUrl}/book/${bookId}`, {observe: 'response'}).pipe(
      map((response: HttpResponse<ComicPanelFlowResponse>) => response.body),
      catchError(err => {
        if (err?.status === 204 || err?.status === 404) {
          return of(null);
        }
        return throwError(() => err);
      })
    );
  }

  savePanelFlow(bookId: number, data: unknown): Observable<void> {
    return this.http.put<void>(`${this.apiUrl}/book/${bookId}`, {data});
  }

  scanPanelFlow(bookId: number, bookType?: string): Observable<ComicPanelFlowResponse> {
    return this.http.post<ComicPanelFlowResponse>(`${this.apiUrl}/book/${bookId}/scan`, {
      bookType: bookType ?? null
    });
  }

  deletePanelFlow(bookId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/book/${bookId}`);
  }
}
