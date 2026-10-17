import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MatchAnalysis } from './models';

@Injectable({ providedIn: 'root' })
export class MatchesService {
  private readonly http = inject(HttpClient);

  list(applicationId: number): Promise<MatchAnalysis[]> {
    return firstValueFrom(
      this.http.get<MatchAnalysis[]>(`/api/applications/${applicationId}/matches`),
    );
  }

  // Without a resumeId the API uses the user's default resume
  run(applicationId: number, resumeId?: number): Promise<MatchAnalysis> {
    return firstValueFrom(
      this.http.post<MatchAnalysis>(
        `/api/applications/${applicationId}/matches`,
        resumeId ? { resumeId } : {},
      ),
    );
  }
}
