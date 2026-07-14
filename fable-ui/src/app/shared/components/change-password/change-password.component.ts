import {Component, OnDestroy, OnInit, inject} from '@angular/core';
import {Button} from 'primeng/button';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {Message} from 'primeng/message';
import {InputText} from 'primeng/inputtext';

import {Password} from 'primeng/password';
import {MessageService} from 'primeng/api';
import {FailureNotificationService} from '../../../shared/service/failure-notification.service';
import {UserService} from '../../../features/settings/user-management/user.service';
import {AuthService} from '../../service/auth.service';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';
import {Subject} from 'rxjs';
import {filter, takeUntil} from 'rxjs/operators';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [
    Button,
    FormsModule,
    Message,
    Password,
    InputText,
    ReactiveFormsModule,
    TranslocoDirective
  ],
  templateUrl: './change-password.component.html',
  styleUrl: './change-password.component.scss'
})
export class ChangePasswordComponent implements OnInit, OnDestroy {
  currentPassword = '';
  newPassword = '';
  confirmNewPassword = '';
  newUsername = '';
  currentUsername = '';
  errorMessage: string | null = null;
  successMessage: string | null = null;
  private readonly destroy$ = new Subject<void>();

  protected userService = inject(UserService);
  protected authService = inject(AuthService);
  protected messageService = inject(MessageService);
  private failureNotifications = inject(FailureNotificationService);
  private readonly t = inject(TranslocoService);

  ngOnInit(): void {
    this.userService.userState$.pipe(
      filter(state => !!state?.user && state.loaded),
      takeUntil(this.destroy$)
    ).subscribe(state => {
      this.currentUsername = state.user?.username ?? '';
      if (!this.newUsername) {
        this.newUsername = this.currentUsername;
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get passwordsMatch(): boolean {
    return this.newPassword === this.confirmNewPassword;
  }

  changePassword() {
    this.errorMessage = null;
    this.successMessage = null;

    if (!this.currentPassword || !this.newPassword || !this.confirmNewPassword) {
      this.errorMessage = this.t.translate('shared.changePassword.validation.allFieldsRequired');
      return;
    }

    if (!this.passwordsMatch) {
      this.errorMessage = this.t.translate('shared.changePassword.validation.passwordsDoNotMatch');
      return;
    }

    if (this.currentPassword === this.newPassword) {
      this.errorMessage = this.t.translate('shared.changePassword.validation.sameAsCurrentPassword');
      return;
    }

    const trimmedUsername = this.newUsername.trim();
    const usernameForRequest = trimmedUsername.length > 0 && trimmedUsername !== this.currentUsername
      ? trimmedUsername
      : null;

    this.userService.changePassword(this.currentPassword, this.newPassword, usernameForRequest).subscribe({
      next: () => {
        this.successMessage = this.t.translate('shared.changePassword.toast.success');
        this.logout();
      },
      error: (err) => {
        this.errorMessage = err.message;
        this.toastError(this.t.translate('shared.changePassword.toast.failedSummary'), this.errorMessage ?? this.t.translate('shared.changePassword.toast.failedDetailDefault'), 3000);
      }
    });
  }

  logout() {
    this.authService.logout();
  }
  private toastError(summary: string, detail: string, life = 3000): void {
    this.messageService.add({severity: 'error', summary, detail, life});
    this.failureNotifications.reportSafe(summary, detail);
  }

}
