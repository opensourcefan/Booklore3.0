import {Component, inject, OnDestroy, OnInit} from '@angular/core';
import {Clipboard} from '@angular/cdk/clipboard';
import {InputText} from 'primeng/inputtext';
import {FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators} from '@angular/forms';
import {Checkbox} from 'primeng/checkbox';
import {MultiSelectModule} from 'primeng/multiselect';
import {SelectButton} from 'primeng/selectbutton';
import {Library} from '../../../book/model/library.model';
import {Button} from 'primeng/button';
import {LibraryService} from '../../../book/service/library.service';
import {UserService} from '../user.service';
import {MessageService} from 'primeng/api';
import {FailureNotificationService} from '../../../../shared/service/failure-notification.service';
import {DynamicDialogRef} from 'primeng/dynamicdialog';
import {passwordMatchValidator} from '../../../../shared/validators/password-match.validator';
import {TranslocoDirective, TranslocoPipe, TranslocoService} from '@jsverse/transloco';
import {
  presetValuesFor,
  USER_PERMISSION_PRESET_DEFAULT,
  UserPermissionPresetId,
} from './user-permission-presets';
import {Subscription} from 'rxjs';
import {buildUserInviteCredentialsPack, buildUserInviteLoginUrl, UserInviteCredentials} from './user-invite-credentials';


@Component({
  selector: 'app-create-user-dialog',
  standalone: true,
  imports: [
    InputText,
    ReactiveFormsModule,
    FormsModule,
    Checkbox,
    MultiSelectModule,
    SelectButton,
    Button,
    TranslocoDirective,
    TranslocoPipe
  ],
  templateUrl: './create-user-dialog.component.html',
  styleUrl: './create-user-dialog.component.scss'
})
export class CreateUserDialogComponent implements OnInit, OnDestroy {
  userForm!: FormGroup;
  libraries: Library[] = [];
  selectedPreset: UserPermissionPresetId = USER_PERMISSION_PRESET_DEFAULT;
  presetOptions: {label: string; value: UserPermissionPresetId}[] = [];
  showCredentialsHandoff = false;
  credentialsPackText = '';
  private createdCredentials: UserInviteCredentials | null = null;

  private fb = inject(FormBuilder);
  private libraryService = inject(LibraryService);
  private userService = inject(UserService);
  private messageService = inject(MessageService);
  private failureNotifications = inject(FailureNotificationService);
  private clipboard = inject(Clipboard);
  private ref = inject(DynamicDialogRef);
  private t = inject(TranslocoService);
  private applyingPreset = false;
  private subscriptions = new Subscription();

  ngOnInit() {
    this.libraries = this.libraryService.getLibrariesFromState();
    this.buildPresetOptions();
    this.subscriptions.add(this.t.langChanges$.subscribe(() => this.buildPresetOptions()));

    this.userForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.email]],
      username: ['', Validators.required],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required],
      selectedLibraries: [[]],
      createPersonalLibrary: [true],
      showLibrary: [false],
      permissionUpload: [false],
      permissionDownload: [false],
      permissionEditMetadata: [false],
      permissionManageLibrary: [false],
      permissionEmailBook: [false],
      permissionDeleteBook: [false],
      permissionAccessOpds: [false],
      permissionSyncKoreader: [false],
      permissionSyncKobo: [false],
      permissionManageMetadataConfig: [false],
      permissionAccessBookdrop: [false],
      permissionAccessLibraryStats: [false],
      permissionAccessUserStats: [false],
      permissionAccessTaskManager: [false],
      permissionManageGlobalPreferences: [false],
      permissionManageIcons: [false],
      permissionManageFonts: [false],
      permissionAdmin: [false],
      permissionBulkAutoFetchMetadata: [false],
      permissionBulkCustomFetchMetadata: [false],
      permissionBulkEditMetadata: [false],
      permissionBulkRegenerateCover: [false],
      permissionMoveOrganizeFiles: [false],
      permissionBulkLockUnlockMetadata: [false],
      permissionBulkResetFableReadProgress: [false],
      permissionBulkResetKoReaderReadProgress: [false],
      permissionBulkResetBookReadStatus: [false],
    }, {validators: [passwordMatchValidator('password', 'confirmPassword')]});

    this.subscriptions.add(
      this.userForm.get('permissionAdmin')?.valueChanges.subscribe((isAdmin: boolean) => {
        if (this.applyingPreset) {
          return;
        }
        const controls = this.userForm.controls;
        Object.keys(controls).forEach(key => {
          if (key !== 'permissionAdmin' && key.startsWith('permission')) {
            controls[key].setValue(isAdmin, {emitEvent: false});
          }
        });
        if (isAdmin) {
          this.selectedPreset = 'admin';
        }
      }) ?? new Subscription()
    );

    Object.keys(this.userForm.controls)
      .filter(key => key.startsWith('permission') && key !== 'permissionAdmin')
      .forEach(key => {
        this.subscriptions.add(
          this.userForm.get(key)!.valueChanges.subscribe(() => {
            if (!this.applyingPreset) {
              this.selectedPreset = 'custom';
            }
          })
        );
      });

    this.applyPreset(USER_PERMISSION_PRESET_DEFAULT);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  applyPreset(preset: UserPermissionPresetId): void {
    if (preset === 'custom') {
      this.selectedPreset = 'custom';
      return;
    }

    this.applyingPreset = true;
    this.selectedPreset = preset;

    if (preset === 'admin') {
      this.userForm.get('permissionAdmin')?.setValue(true, {emitEvent: true});
    } else {
      this.userForm.patchValue(presetValuesFor(preset), {emitEvent: false});
    }

    this.applyingPreset = false;
  }

  createUser() {
    if (this.userForm.invalid) {
      this.messageService.add({
        severity: 'warn',
        summary: this.t.translate('common.error'),
        detail: this.t.translate('settingsUsers.createDialog.validationError')
      });
      return;
    }
    const {confirmPassword, ...formValue} = this.userForm.value;
    void confirmPassword;

    const email = typeof formValue.email === 'string' ? formValue.email.trim() : '';
    const selectedLibs = Array.isArray(formValue.selectedLibraries) ? formValue.selectedLibraries : [];
    const username = String(formValue.username ?? '').trim();
    const password = String(formValue.password ?? '');
    const userData = {
      ...formValue,
      email: email.length > 0 ? email : null,
      selectedLibraries: selectedLibs.map((lib: Library) => lib.id),
      createPersonalLibrary: !!formValue.createPersonalLibrary,
      showLibrary: !!formValue.showLibrary,
    };

    this.userService.createUser(userData).subscribe({
      next: () => {
        this.createdCredentials = {
          loginUrl: buildUserInviteLoginUrl(),
          username,
          password,
        };
        this.credentialsPackText = buildUserInviteCredentialsPack(this.createdCredentials);
        this.showCredentialsHandoff = true;
        this.messageService.add({
          severity: 'success',
          summary: this.t.translate('common.success'),
          detail: this.t.translate('settingsUsers.createDialog.createSuccess')
        });
      },
      error: (err) => {
        this.toastError(this.t.translate('common.error'), err?.error?.message
            ? this.t.translate('settingsUsers.createDialog.createFailed', {message: err.error.message})
            : this.t.translate('settingsUsers.createDialog.createError'));
      }
    });
  }

  copyCredentialsPack(): void {
    if (!this.credentialsPackText) {
      return;
    }
    // Prefer CDK copy (textarea + execCommand). navigator.clipboard.writeText often
    // fails on plain-http LAN origins that are not a secure context.
    if (this.clipboard.copy(this.credentialsPackText)) {
      this.messageService.add({
        severity: 'success',
        summary: this.t.translate('common.success'),
        detail: this.t.translate('settingsUsers.createDialog.credentialsCopied'),
      });
      return;
    }

    this.selectCredentialsPackText();
    this.toastError(
      this.t.translate('common.error'),
      this.t.translate('settingsUsers.createDialog.credentialsCopyFailed')
    );
  }

  private selectCredentialsPackText(): void {
    const el = document.getElementById('created-credentials-pack') as HTMLTextAreaElement | null;
    if (!el) {
      return;
    }
    el.focus();
    el.select();
  }

  finishAfterCredentials(): void {
    this.ref.close(true);
  }

  closeDialog(): void {
    this.ref.close(this.showCredentialsHandoff);
  }

  presetDescriptionKey(): string | null {
    if (this.selectedPreset === 'custom') {
      return null;
    }
    return `createDialog.presetDescriptions.${this.selectedPreset}`;
  }

  private buildPresetOptions(): void {
    const ids: Exclude<UserPermissionPresetId, 'custom'>[] = ['reader', 'contributor', 'librarian', 'admin'];
    this.presetOptions = ids.map(value => ({
      value,
      label: this.t.translate(`settingsUsers.createDialog.presets.${value}`),
    }));
  }

  private toastError(summary: string, detail: string, life?: number): void {
    this.failureNotifications.reportSafe(summary, detail);
    this.messageService.add({severity: 'error', summary, detail, ...(life != null ? {life} : {})});
  }
}
