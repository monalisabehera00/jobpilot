import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  ApplicationInput,
  ApplicationQuery,
  ApplicationStatus,
  JobApplication,
  Paginated,
} from './models';

const API = '/api/applications';
const MAX_PAGE_SIZE = 100;

function toParams(query: ApplicationQuery): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params = params.set(key, value);
  }
  return params;
}

@Injectable({ providedIn: 'root' })
export class ApplicationsService {
  private readonly http = inject(HttpClient);

  list(query: ApplicationQuery = {}): Promise<Paginated<JobApplication>> {
    return firstValueFrom(
      this.http.get<Paginated<JobApplication>>(API, { params: toParams(query) }),
    );
  }

  // The board needs every card, so fetch all pages (the API caps a page at 100)
  async listAll(query: ApplicationQuery = {}): Promise<JobApplication[]> {
    const first = await this.list({ ...query, page: 1, limit: MAX_PAGE_SIZE });
    const remaining = Array.from({ length: first.pagination.totalPages - 1 }, (_, i) =>
      this.list({ ...query, page: i + 2, limit: MAX_PAGE_SIZE }),
    );
    const pages = await Promise.all(remaining);
    return [first, ...pages].flatMap((page) => page.data);
  }

  create(input: ApplicationInput): Promise<JobApplication> {
    return firstValueFrom(this.http.post<JobApplication>(API, input));
  }

  update(id: number, input: Partial<ApplicationInput>): Promise<JobApplication> {
    return firstValueFrom(this.http.put<JobApplication>(`${API}/${id}`, input));
  }

  updateStatus(id: number, status: ApplicationStatus): Promise<JobApplication> {
    return firstValueFrom(this.http.patch<JobApplication>(`${API}/${id}/status`, { status }));
  }

  delete(id: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${API}/${id}`));
  }
}
