import {inject, Injectable} from '@angular/core';
import {BehaviorSubject} from 'rxjs';
import {FailureNotificationService} from './failure-notification.service';

export interface WriteProgressPayload {
  message: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
}

@Injectable({
  providedIn: 'root'
})
export class WriteProgressService {
  private subject = new BehaviorSubject<WriteProgressPayload | null>(null);
  private readonly failureNotifications = inject(FailureNotificationService);
  readonly progress$ = this.subject.asObservable();

  show(message: string): void {
    this.subject.next({message, status: 'IN_PROGRESS'});
  }

  complete(message: string): void {
    this.subject.next({message, status: 'COMPLETED'});
  }

  fail(message: string): void {
    this.subject.next({message, status: 'FAILED'});
    this.failureNotifications.reportSafe('Update failed', message);
  }

  clear(): void {
    this.subject.next(null);
  }
}
