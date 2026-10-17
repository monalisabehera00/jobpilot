export const STATUSES = ['Wishlist', 'Applied', 'Interview', 'Offer', 'Rejected'] as const;
export type ApplicationStatus = (typeof STATUSES)[number];

export type SortField =
  | 'createdAt'
  | 'updatedAt'
  | 'appliedOn'
  | 'nextFollowUpOn'
  | 'companyName'
  | 'jobTitle'
  | 'status';

export interface User {
  id: number;
  name: string;
  email: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface JobApplication {
  id: number;
  companyName: string;
  jobTitle: string;
  jobDescription: string | null;
  jobUrl: string | null;
  location: string | null;
  notes: string | null;
  status: ApplicationStatus;
  appliedOn: string | null;
  nextFollowUpOn: string | null;
  createdAt: string;
  updatedAt: string;
}

// Blank strings are fine: the API stores them as null
export interface ApplicationInput {
  companyName: string;
  jobTitle: string;
  status?: ApplicationStatus;
  jobDescription?: string | null;
  jobUrl?: string | null;
  location?: string | null;
  notes?: string | null;
  appliedOn?: string | null;
  nextFollowUpOn?: string | null;
}

export interface ApplicationQuery {
  page?: number;
  limit?: number;
  status?: ApplicationStatus | '';
  company?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: SortField;
  sortOrder?: 'asc' | 'desc';
}

export interface Paginated<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface Resume {
  id: number;
  fileName: string;
  isDefault: boolean;
  textLength: number;
  preview: string;
  uploadedAt: string;
  extractedText?: string;
}

export interface MatchAnalysis {
  id: number;
  applicationId: number;
  resumeId: number;
  resumeFileName: string;
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  suggestions: string[];
  model: string;
  createdAt: string;
}
