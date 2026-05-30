import {inject, Injectable} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {Observable, map} from 'rxjs';
import {BookMetadata} from '../model/book.model';
import {API_CONFIG} from '../../../core/config/api-config';
import {MetadataBatchProgressNotification} from '../../../shared/model/metadata-batch-progress.model';
import {TaskCreateResponse} from '../../settings/task-management/task.service';

export interface MetadataTaskCancelResponse {
  taskId: string;
  cancelled: boolean;
  message: string;
}

export enum FetchedMetadataProposalStatus {
  FETCHED = 'FETCHED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}

export interface FetchedProposal {
  proposalId: number;
  taskId: string;
  bookId: number;
  fetchedAt: string;
  reviewedAt: string | null;
  reviewerUserId: string | null;
  status: FetchedMetadataProposalStatus;
  metadataJson: BookMetadata;
}

export interface MetadataFetchTask {
  id: string;
  status: string;
  completed: number;
  totalBooks: number;
  startedAt: string;
  completedAt: string | null;
  initiatedBy: string;
  errorMessage: string | null;

  proposals: FetchedProposal[];
}

export interface MetadataResumableTask {
  taskId: string;
  status: string;
  startedAt: string;
  pendingBooksCount: number;
  message: string;
}

export interface MetadataTaskLogBook {
  bookId: number;
  title: string;
  fileName: string;
}

export interface MetadataTaskLog {
  taskId: string;
  status: string;
  message: string;
  startedAt: string;
  completedAt: string | null;
  completed: number;
  total: number;
  pending: number;
  fetchedBooks: MetadataTaskLogBook[];
  remainingBooks: MetadataTaskLogBook[];
}

@Injectable({
  providedIn: 'root'
})
export class MetadataTaskService {

  private readonly url = `${API_CONFIG.BASE_URL}/api/metadata/tasks`;
  private http = inject(HttpClient);

  getTaskWithProposals(taskId: string): Observable<MetadataFetchTask> {
    return this.http.get<{ task: MetadataFetchTask }>(`${this.url}/${taskId}`)
      .pipe(
        map(response => response.task)
      );
  }

  deleteTask(taskId: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/${taskId}`);
  }

  cancelTask(taskId: string): Observable<MetadataTaskCancelResponse> {
    return this.http.delete<MetadataTaskCancelResponse>(`${this.url}/${taskId}/cancel`);
  }

  getLatestResumableTask(): Observable<MetadataResumableTask | null> {
    return this.http.get<MetadataResumableTask>(`${this.url}/resumable/latest`, {observe: 'response'}).pipe(
      map(response => response.body ?? null)
    );
  }

  getTaskLog(taskId: string): Observable<MetadataTaskLog> {
    return this.http.get<MetadataTaskLog>(`${this.url}/${taskId}/log`);
  }

  resumeTask(taskId: string): Observable<TaskCreateResponse> {
    return this.http.post<TaskCreateResponse>(`${this.url}/${taskId}/resume`, null);
  }

  updateProposalStatus(taskId: string, proposalId: number, status: string): Observable<void> {
    return this.http.post<void>(`${this.url}/${taskId}/proposals/${proposalId}/status`, null, {
      params: {status}
    });
  }

  getActiveTasks(): Observable<MetadataBatchProgressNotification[]> {
    return this.http.get<MetadataBatchProgressNotification[]>(`${this.url}/active`);
  }
}
