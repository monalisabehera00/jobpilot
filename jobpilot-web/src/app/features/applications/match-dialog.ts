import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api-error';
import { MatchesService } from '../../core/matches.service';
import { JobApplication, MatchAnalysis, Resume } from '../../core/models';
import { ResumesService } from '../../core/resumes.service';
import { ToastService } from '../../core/toast.service';
import { ApiDatePipe } from '../../shared/dates';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-match-dialog',
  imports: [ApiDatePipe, RouterLink, Icon],
  templateUrl: './match-dialog.html',
})
export class MatchDialog {
  protected readonly application = inject<JobApplication>(DIALOG_DATA);
  protected readonly ref = inject(DialogRef);
  private readonly dialog = inject(Dialog);
  private readonly matchesApi = inject(MatchesService);
  private readonly resumesApi = inject(ResumesService);
  private readonly toast = inject(ToastService);

  protected readonly hasJobDescription = !!this.application.jobDescription?.trim();
  protected readonly resumes = signal<Resume[]>([]);
  protected readonly matches = signal<MatchAnalysis[]>([]);
  protected readonly resumeId = signal<number | null>(null);
  protected readonly selectedId = signal<number | null>(null);
  protected readonly loading = signal(true);
  protected readonly running = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly current = computed(() => {
    const list = this.matches();
    return list.find((m) => m.id === this.selectedId()) ?? list[0] ?? null;
  });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const [resumes, matches] = await Promise.all([
        this.resumesApi.list(),
        this.matchesApi.list(this.application.id),
      ]);
      this.resumes.set(resumes);
      this.matches.set(matches);
      this.resumeId.set(resumes.find((r) => r.isDefault)?.id ?? resumes[0]?.id ?? null);
    } catch (err) {
      this.error.set(apiErrorMessage(err, 'Could not load match data.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async run(): Promise<void> {
    this.running.set(true);
    this.error.set(null);
    try {
      const match = await this.matchesApi.run(this.application.id, this.resumeId() ?? undefined);
      this.matches.update((list) => [match, ...list]);
      this.selectedId.set(match.id);
    } catch (err) {
      this.error.set(apiErrorMessage(err, 'The match analysis failed.'));
    } finally {
      this.running.set(false);
    }
  }

  protected scoreColor(score: number): string {
    if (score >= 75) return '#059669';
    if (score >= 50) return '#d97706';
    return '#e11d48';
  }

  protected async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.success('Copied to clipboard.');
    } catch {
      this.toast.error('Could not copy. Select the text and copy it manually.');
    }
  }

  // The link leaves this page, so close every open dialog (the edit form may be underneath)
  protected closeAll(): void {
    this.dialog.closeAll();
  }
}

export function openMatchDialog(dialog: Dialog, application: JobApplication): void {
  dialog.open(MatchDialog, { data: application, ariaLabel: 'AI resume match' });
}
