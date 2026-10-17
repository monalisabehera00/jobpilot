import { Dialog } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';
import { apiErrorMessage } from '../../core/api-error';
import { Resume } from '../../core/models';
import { MAX_RESUME_BYTES, ResumesService } from '../../core/resumes.service';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../shared/confirm-dialog';
import { ApiDatePipe } from '../../shared/dates';
import { Icon } from '../../shared/icon';
import { ResumeTextDialog } from './resume-text-dialog';

@Component({
  selector: 'app-resumes',
  imports: [ApiDatePipe, Icon],
  templateUrl: './resumes.html',
})
export class Resumes {
  private readonly api = inject(ResumesService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly confirmService = inject(ConfirmService);

  protected readonly resumes = signal<Resume[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly uploading = signal(false);
  protected readonly dragOver = signal(false);
  protected readonly busyId = signal<number | null>(null);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loadError.set(null);
    try {
      this.resumes.set(await this.api.list());
    } catch (err) {
      this.loadError.set(apiErrorMessage(err, 'Could not load your resumes.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow choosing the same file again later
    if (file) void this.upload(file);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    const file = event.dataTransfer?.files[0];
    if (file) void this.upload(file);
  }

  // Quick checks for instant feedback; the API still validates the file itself
  private async upload(file: File): Promise<void> {
    const looksLikePdf =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!looksLikePdf) {
      this.toast.error('Only PDF files are allowed.');
      return;
    }
    if (file.size > MAX_RESUME_BYTES) {
      this.toast.error('Resume must be 5 MB or smaller.');
      return;
    }

    this.uploading.set(true);
    try {
      const resume = await this.api.upload(file);
      this.toast.success(
        resume.isDefault
          ? `${resume.fileName} uploaded and set as default.`
          : `${resume.fileName} uploaded.`,
      );
      await this.load();
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'Upload failed.'));
    } finally {
      this.uploading.set(false);
    }
  }

  protected viewText(resume: Resume): void {
    this.dialog.open(ResumeTextDialog, { data: resume, ariaLabel: `Text of ${resume.fileName}` });
  }

  protected async makeDefault(resume: Resume): Promise<void> {
    this.busyId.set(resume.id);
    try {
      await this.api.setDefault(resume.id);
      this.toast.success(`${resume.fileName} is now your default resume.`);
      await this.load();
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'Could not change the default resume.'));
    } finally {
      this.busyId.set(null);
    }
  }

  protected async remove(resume: Resume): Promise<void> {
    const confirmed = await this.confirmService.confirm({
      title: 'Delete resume?',
      message: `This permanently deletes ${resume.fileName}.`,
    });
    if (!confirmed) return;

    this.busyId.set(resume.id);
    try {
      await this.api.delete(resume.id);
      this.toast.success('Resume deleted.');
      await this.load();
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'Could not delete the resume.'));
    } finally {
      this.busyId.set(null);
    }
  }
}
