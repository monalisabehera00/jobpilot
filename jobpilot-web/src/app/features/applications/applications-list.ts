import { Dialog } from '@angular/cdk/dialog';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { debounceTime } from 'rxjs';
import { apiErrorMessage } from '../../core/api-error';
import { ApplicationsService } from '../../core/applications.service';
import {
  ApplicationStatus,
  JobApplication,
  Paginated,
  SortField,
  STATUSES,
} from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../shared/confirm-dialog';
import { CompanyAvatar } from '../../shared/company-avatar';
import { ApiDatePipe } from '../../shared/dates';
import { Icon } from '../../shared/icon';
import { STATUS_STYLES } from '../../shared/status-styles';
import { openApplicationForm } from './application-form-dialog';
import { openMatchDialog } from './match-dialog';

const TEXT_FIELDS: SortField[] = ['companyName', 'jobTitle', 'status'];

@Component({
  selector: 'app-applications-list',
  imports: [ReactiveFormsModule, ApiDatePipe, Icon, CompanyAvatar],
  templateUrl: './applications-list.html',
})
export class ApplicationsList {
  private readonly api = inject(ApplicationsService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly confirmService = inject(ConfirmService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly statuses = STATUSES;
  protected readonly styles = STATUS_STYLES;
  protected readonly pageSizes = [10, 25, 50];
  protected readonly columns: { key: SortField; label: string }[] = [
    { key: 'companyName', label: 'Company' },
    { key: 'jobTitle', label: 'Role' },
    { key: 'status', label: 'Status' },
    { key: 'appliedOn', label: 'Applied' },
    { key: 'nextFollowUpOn', label: 'Follow up' },
    { key: 'updatedAt', label: 'Updated' },
  ];

  protected readonly filters = this.fb.group({
    search: [''],
    company: [''],
    status: this.fb.control<ApplicationStatus | ''>(''),
    dateFrom: [''],
    dateTo: [''],
  });

  protected readonly sortBy = signal<SortField>('createdAt');
  protected readonly sortOrder = signal<'asc' | 'desc'>('desc');
  protected readonly page = signal(1);
  protected readonly limit = signal(10);

  protected readonly result = signal<Paginated<JobApplication> | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly range = computed(() => {
    const p = this.result()?.pagination;
    if (!p || p.total === 0) return null;
    return {
      from: (p.page - 1) * p.limit + 1,
      to: Math.min(p.page * p.limit, p.total),
      total: p.total,
    };
  });

  // Ignores responses from older requests if the user changes filters quickly
  private requestId = 0;

  constructor() {
    this.filters.valueChanges.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => {
      this.page.set(1);
      void this.load();
    });
    void this.load();
  }

  protected async load(): Promise<void> {
    const id = ++this.requestId;
    this.loading.set(true);
    try {
      const res = await this.api.list({
        ...this.filters.getRawValue(),
        page: this.page(),
        limit: this.limit(),
        sortBy: this.sortBy(),
        sortOrder: this.sortOrder(),
      });
      if (id !== this.requestId) return;

      // After deleting the last row of the last page, step back to a page that exists
      const { totalPages } = res.pagination;
      if (res.data.length === 0 && this.page() > 1 && this.page() > totalPages) {
        this.page.set(Math.max(totalPages, 1));
        return this.load();
      }

      this.result.set(res);
      this.error.set(null);
    } catch (err) {
      if (id === this.requestId)
        this.error.set(apiErrorMessage(err, 'Could not load applications.'));
    } finally {
      if (id === this.requestId) this.loading.set(false);
    }
  }

  protected sort(key: SortField): void {
    if (this.sortBy() === key) {
      this.sortOrder.update((order) => (order === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortBy.set(key);
      this.sortOrder.set(TEXT_FIELDS.includes(key) ? 'asc' : 'desc');
    }
    this.page.set(1);
    void this.load();
  }

  protected ariaSort(key: SortField): 'ascending' | 'descending' | 'none' {
    if (this.sortBy() !== key) return 'none';
    return this.sortOrder() === 'asc' ? 'ascending' : 'descending';
  }

  protected goTo(page: number): void {
    this.page.set(page);
    void this.load();
  }

  protected changeLimit(value: string): void {
    this.limit.set(Number(value));
    this.page.set(1);
    void this.load();
  }

  protected clearFilters(): void {
    this.filters.reset();
  }

  protected async openForm(application?: JobApplication): Promise<void> {
    const result = await openApplicationForm(this.dialog, { application });
    if (result) await this.load();
  }

  protected openMatch(app: JobApplication, event: Event): void {
    event.stopPropagation();
    openMatchDialog(this.dialog, app);
  }

  protected async remove(app: JobApplication, event: Event): Promise<void> {
    event.stopPropagation();
    const confirmed = await this.confirmService.confirm({
      title: 'Delete application?',
      message: `This permanently deletes ${app.jobTitle} at ${app.companyName}.`,
    });
    if (!confirmed) return;

    try {
      await this.api.delete(app.id);
      this.toast.success('Application deleted.');
      await this.load();
    } catch (err) {
      this.toast.error(apiErrorMessage(err, 'Could not delete the application.'));
    }
  }
}
