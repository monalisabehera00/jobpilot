import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { apiErrorMessage, apiFieldErrors } from '../../core/api-error';
import { ApplicationsService } from '../../core/applications.service';
import { ApplicationStatus, JobApplication, STATUSES } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../shared/confirm-dialog';
import { Icon } from '../../shared/icon';
import { openMatchDialog } from './match-dialog';

export interface ApplicationFormData {
  application?: JobApplication;
  status?: ApplicationStatus;
}

export type ApplicationFormResult =
  { action: 'saved'; application: JobApplication } | { action: 'deleted'; id: number };

type Field =
  | 'companyName'
  | 'jobTitle'
  | 'status'
  | 'location'
  | 'jobUrl'
  | 'appliedOn'
  | 'nextFollowUpOn'
  | 'jobDescription'
  | 'notes';

@Component({
  selector: 'app-application-form-dialog',
  imports: [ReactiveFormsModule, Icon],
  templateUrl: './application-form-dialog.html',
})
export class ApplicationFormDialog {
  private readonly data = inject<ApplicationFormData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<ApplicationFormResult>>(DialogRef);
  private readonly api = inject(ApplicationsService);
  private readonly toast = inject(ToastService);
  private readonly confirmService = inject(ConfirmService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly dialog = inject(Dialog);

  protected readonly statuses = STATUSES;
  protected readonly existing = this.data.application;
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  private readonly serverErrors = signal<Partial<Record<string, string>>>({});

  protected readonly form = this.fb.group({
    companyName: [
      this.existing?.companyName ?? '',
      [Validators.required, Validators.maxLength(150)],
    ],
    jobTitle: [this.existing?.jobTitle ?? '', [Validators.required, Validators.maxLength(150)]],
    status: this.fb.control<ApplicationStatus>(
      this.existing?.status ?? this.data.status ?? 'Wishlist',
    ),
    location: [this.existing?.location ?? '', Validators.maxLength(100)],
    jobUrl: [
      this.existing?.jobUrl ?? '',
      [Validators.maxLength(500), Validators.pattern(/^https?:\/\/\S+$/i)],
    ],
    appliedOn: [this.existing?.appliedOn ?? ''],
    nextFollowUpOn: [this.existing?.nextFollowUpOn ?? ''],
    jobDescription: [this.existing?.jobDescription ?? '', Validators.maxLength(50000)],
    notes: [this.existing?.notes ?? '', Validators.maxLength(10000)],
  });

  constructor() {
    // Server messages describe the old value, so drop them once the user edits
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      if (Object.keys(this.serverErrors()).length) this.serverErrors.set({});
    });
  }

  protected errorFor(field: Field): string | null {
    const server = this.serverErrors()[field];
    if (server) return server;

    const control = this.form.controls[field];
    if (!control.touched || !control.errors) return null;
    if (control.errors['required']) return 'This field is required.';
    if (control.errors['maxlength']) {
      return `Use at most ${control.errors['maxlength'].requiredLength} characters.`;
    }
    if (control.errors['pattern']) return 'Enter a full link starting with http:// or https://';
    return 'Invalid value.';
  }

  // Matching reads the saved job description, so unsaved edits must be saved first
  protected openMatch(): void {
    if (this.existing) openMatchDialog(this.dialog, this.existing);
  }

  protected close(): void {
    this.ref.close();
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.formError.set(null);
    try {
      const input = this.form.getRawValue();
      const application = this.existing
        ? await this.api.update(this.existing.id, input)
        : await this.api.create(input);
      this.toast.success(this.existing ? 'Application updated.' : 'Application added.');
      this.ref.close({ action: 'saved', application });
    } catch (err) {
      this.serverErrors.set(apiFieldErrors(err));
      this.formError.set(apiErrorMessage(err, 'Could not save the application.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const app = this.existing;
    if (!app) return;

    const confirmed = await this.confirmService.confirm({
      title: 'Delete application?',
      message: `This permanently deletes ${app.jobTitle} at ${app.companyName}.`,
    });
    if (!confirmed) return;

    this.saving.set(true);
    try {
      await this.api.delete(app.id);
      this.toast.success('Application deleted.');
      this.ref.close({ action: 'deleted', id: app.id });
    } catch (err) {
      this.formError.set(apiErrorMessage(err, 'Could not delete the application.'));
    } finally {
      this.saving.set(false);
    }
  }
}

// Opens the add/edit form; resolves with what happened, or undefined if it was dismissed
export function openApplicationForm(
  dialog: Dialog,
  data: ApplicationFormData = {},
): Promise<ApplicationFormResult | undefined> {
  const ref = dialog.open<ApplicationFormResult, ApplicationFormData>(ApplicationFormDialog, {
    data,
    ariaLabel: data.application ? 'Edit application' : 'Add application',
  });
  return firstValueFrom(ref.closed);
}
