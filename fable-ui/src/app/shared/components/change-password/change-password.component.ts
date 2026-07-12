import {Component, inject} from '@angular/core';
import {Button} from 'primeng/button';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {Message} from 'primeng/message';

import {Password} from 'primeng/password';
import {MessageService} from 'primeng/api';
import {FailureNotificationService} from '../../../shared/service/failure-notification.service';
import {UserService} from '../../../features/settings/user-management/user.service';
import {AuthService} from '../../service/auth.service';
import {TranslocoDirective, TranslocoService} from '@jsverse/transloco';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [
    Button,
    FormsModule,
    Message,
    Password,
    ReactiveFormsModule,
    TranslocoDirective
  ],
  templateUrl: './change-password.component.html',
  styleUrl: './change-password.component.scss'
})
export class ChangePasswordComponent {
  currentPassword = '';
  newPassword = '';
  confirmNewPassword = '';
  errorMessage: string | null = null;
  successMessage: string | null = null;

  protected userService = inject(UserService);
  protected authService = inject(AuthService);
  protected messageService = inject(MessageService);
  private failureNotifications = inject(FailureNotificationService);
  private readonly t = inject(TranslocoService);

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

    this.userService.changePassword(this.currentPassword, this.newPassword).subscribe({
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
