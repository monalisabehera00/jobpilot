import { Dialog } from '@angular/cdk/dialog';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragPlaceholder,
  CdkDropList,
  CdkDropListGroup,
} from '@angular/cdk/drag-drop';
import { Component, computed, inject, signal } from '@angular/core';
import { apiErrorMessage } from '../../core/api-error';
import { ApplicationsService } from '../../core/applications.service';
import { ApplicationStatus, JobApplication, STATUSES } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { CompanyAvatar } from '../../shared/company-avatar';
import { ApiDatePipe, isFollowUpDue } from '../../shared/dates';
import { Icon, IconName } from '../../shared/icon';
import { STATUS_STYLES } from '../../shared/status-styles';
import { ApplicationFormData, openApplicationForm } from '../applications/application-form-dialog';

@Component({
  selector: 'app-board',
  imports: [
    CdkDropListGroup,
    CdkDropList,
    CdkDrag,
    CdkDragPlaceholder,
    ApiDatePipe,
    Icon,
    CompanyAvatar,
  ],
  templateUrl: './board.html',
})
export class Board {
  private readonly api = inject(ApplicationsService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);

  protected readonly statuses = STATUSES;
  protected readonly styles = STATUS_STYLES;
  protected readonly isFollowUpDue = isFollowUpDue;

  protected readonly applications = signal<JobApplication[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly filter = signal('');

  // Cards grouped by column, most recently updated first, narrowed by the filter box
  protected readonly columns = computed(() => {
    const term = this.filter().trim().toLowerCase();
    const groups = Object.fromEntries(STATUSES.map((s) => [s, [] as JobApplication[]])) as Record<
      ApplicationStatus,
      JobApplication[]
    >;

    for (const app of this.applications()) {
      const text = `${app.companyName} ${app.jobTitle} ${app.location ?? ''}`.toLowerCase();
      if (!term || text.includes(term)) groups[app.status].push(app);
    }
    for (const list of Object.values(groups)) {
      list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id - a.id);
    }
    return groups;
  });

  // Summary tiles above the board (computed from all cards, ignoring the filter box)
  protected readonly stats = computed(() => {
    const apps = this.applications();
    const count = (status: ApplicationStatus) => apps.filter((a) => a.status === status).length;
    const submitted = apps.length - count('Wishlist');
    const responses = count('Interview') + count('Offer');
    const tiles: {
      label: string;
      value: number | string;
      hint: string;
      icon: IconName;
      tone: string;
    }[] = [
      {
        label: 'Applications',
        value: apps.length,
        hint: `${submitted} submitted`,
        icon: 'briefcase',
        tone: 'bg-indigo-50 text-indigo-600',
      },
      {
        label: 'Interviews',
        value: count('Interview'),
        hint: `${submitted ? Math.round((responses / submitted) * 100) : 0}% response rate`,
        icon: 'target',
        tone: 'bg-amber-50 text-amber-600',
      },
      {
        label: 'Offers',
        value: count('Offer'),
        hint: count('Offer') ? 'Congratulations!' : 'Keep going',
        icon: 'star',
        tone: 'bg-emerald-50 text-emerald-600',
      },
      {
        label: 'Follow-ups due',
        value: apps.filter(
          (a) => a.status !== 'Offer' && a.status !== 'Rejected' && isFollowUpDue(a.nextFollowUpOn),
        ).length,
        hint: 'Today or overdue',
        icon: 'bell',
        tone: 'bg-rose-50 text-rose-600',
      },
    ];
    return tiles;
  });

  // A drag ends with a click on the card; this keeps that click from opening the editor
  private lastDragEnd = 0;

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.applications.set(await this.api.listAll());
    } catch (err) {
      this.loadError.set(apiErrorMessage(err, 'Could not load your applications.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async drop(event: CdkDragDrop<ApplicationStatus, ApplicationStatus, JobApplication>) {
    if (event.previousContainer === event.container) return;

    const original = event.item.data;
    const status = event.container.data;

    // Move the card right away, then confirm with the API (or put it back on failure)
    this.replace({ ...original, status });
    try {
      this.replace(await this.api.updateStatus(original.id, status));
    } catch (err) {
      this.replace(original);
      this.toast.error(apiErrorMessage(err, 'Could not move the card.'));
    }
  }

  protected dragEnded(): void {
    this.lastDragEnd = Date.now();
  }

  protected async open(app: JobApplication): Promise<void> {
    if (Date.now() - this.lastDragEnd < 300) return;
    await this.openForm({ application: app });
  }

  protected async openForm(data: ApplicationFormData = {}): Promise<void> {
    const result = await openApplicationForm(this.dialog, data);
    if (result?.action === 'saved') {
      const exists = this.applications().some((a) => a.id === result.application.id);
      if (exists) this.replace(result.application);
      else this.applications.update((list) => [result.application, ...list]);
    } else if (result?.action === 'deleted') {
      this.applications.update((list) => list.filter((a) => a.id !== result.id));
    }
  }

  private replace(app: JobApplication): void {
    this.applications.update((list) => list.map((a) => (a.id === app.id ? app : a)));
  }
}
