import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { Component, inject, signal } from '@angular/core';
import { apiErrorMessage } from '../../core/api-error';
import { Resume } from '../../core/models';
import { ResumesService } from '../../core/resumes.service';
import { Icon } from '../../shared/icon';

@Component({
  selector: 'app-resume-text-dialog',
  imports: [Icon],
  template: `
    <div class="dialog-panel max-w-3xl">
      <div class="mb-5 flex items-start gap-4">
        <span class="grid size-11 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600">
          <app-icon name="file" [size]="20" />
        </span>
        <div class="min-w-0 flex-1">
          <h2 class="text-lg font-semibold text-slate-900">Extracted text</h2>
          <p class="truncate text-sm text-slate-500">{{ resume.fileName }}</p>
        </div>
        <button type="button" class="icon-btn -mt-1 -mr-2" aria-label="Close" (click)="ref.close()">
          <app-icon name="x" [size]="18" />
        </button>
      </div>

      @if (error()) {
        <p class="alert-error" role="alert">
          <app-icon name="alert" [size]="16" class="mt-0.5" /> {{ error() }}
        </p>
      } @else if (text() === null) {
        <p class="py-8 text-center text-slate-500">Loading…</p>
      } @else {
        <pre
          class="max-h-[60vh] overflow-auto rounded-xl bg-slate-50 p-5 font-sans text-sm leading-relaxed whitespace-pre-wrap text-slate-700 ring-1 ring-slate-900/5"
          >{{ text() }}</pre>
      }
    </div>
  `,
})
export class ResumeTextDialog {
  protected readonly resume = inject<Resume>(DIALOG_DATA);
  protected readonly ref = inject(DialogRef);
  protected readonly text = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor() {
    inject(ResumesService)
      .get(this.resume.id)
      .then((r) => this.text.set(r.extractedText ?? ''))
      .catch((err: unknown) => this.error.set(apiErrorMessage(err, 'Could not load the text.')));
  }
}
