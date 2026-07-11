import {Injectable} from '@angular/core';

export type SaveButtonStatus = 'idle' | 'dirty' | 'success' | 'error';

export type SaveButtonSeverity = 'secondary' | 'warn' | 'success' | 'danger';

/**
 * Grey idle / orange dirty / green success / red error.
 * Outcome colors persist until the next user-initiated change.
 *
 * Prefer binding both [severity] and [styleClass] — styleClass uses forced
 * CSS in styles.scss so dirty orange is visible even if PrimeNG severity
 * theming/OnPush fails to paint.
 */
@Injectable()
export class SaveButtonStatusController {
  private status: SaveButtonStatus = 'idle';

  get value(): SaveButtonStatus {
    return this.status;
  }

  /** PrimeNG p-button severity */
  get severity(): SaveButtonSeverity {
    switch (this.status) {
      case 'dirty':
        return 'warn';
      case 'success':
        return 'success';
      case 'error':
        return 'danger';
      default:
        return 'secondary';
    }
  }

  /** Prefer dirty (warn) over last outcome color. */
  severityFor(dirty: boolean): SaveButtonSeverity {
    if (dirty || this.status === 'dirty') {
      return 'warn';
    }
    return this.severity;
  }

  /** Forced visual class — bind as [styleClass]="…styleClassFor(dirty)". */
  styleClassFor(dirty: boolean): string {
    const state: SaveButtonStatus =
      dirty || this.status === 'dirty'
        ? 'dirty'
        : this.status === 'success'
          ? 'success'
          : this.status === 'error'
            ? 'error'
            : 'idle';
    return `bl-save-btn bl-save-btn--${state}`;
  }

  get styleClass(): string {
    return this.styleClassFor(false);
  }

  get disabledForIdle(): boolean {
    return this.status === 'idle' || this.status === 'success';
  }

  /** Disable when clean (idle/success), allow retry after error. */
  disabledWhenClean(dirty: boolean, isSaving = false): boolean {
    return isSaving || (!dirty && this.status !== 'error' && this.status !== 'dirty');
  }

  markDirty(): void {
    this.status = 'dirty';
  }

  markSuccess(): void {
    this.status = 'success';
  }

  markError(): void {
    this.status = 'error';
  }

  resetIdle(): void {
    this.status = 'idle';
  }

  /**
   * Call when form values change from a user edit.
   * Only promotes to dirty — never clears outcome/dirty from a false "clean" pulse
   * (spurious valueChanges after enable/disable can report dirty=false briefly).
   */
  onUserEdit(hasChanges: boolean): void {
    if (hasChanges) {
      this.markDirty();
    }
  }
}
