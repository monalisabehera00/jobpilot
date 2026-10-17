import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Resume } from './models';

const API = '/api/resumes';

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

@Injectable({ providedIn: 'root' })
export class ResumesService {
  private readonly http = inject(HttpClient);

  list(): Promise<Resume[]> {
    return firstValueFrom(this.http.get<Resume[]>(API));
  }

  get(id: number): Promise<Resume> {
    return firstValueFrom(this.http.get<Resume>(`${API}/${id}`));
  }

  upload(file: File): Promise<Resume> {
    const form = new FormData();
    form.append('resume', file, file.name);
    return firstValueFrom(this.http.post<Resume>(API, form));
  }

  setDefault(id: number): Promise<Resume> {
    return firstValueFrom(this.http.patch<Resume>(`${API}/${id}/default`, {}));
  }

  delete(id: number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${API}/${id}`));
  }
}
