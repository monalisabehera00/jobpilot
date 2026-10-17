import { z } from 'zod';

export const STATUSES = ['Wishlist', 'Applied', 'Interview', 'Offer', 'Rejected'];
export const SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'appliedOn',
  'nextFollowUpOn',
  'companyName',
  'jobTitle',
  'status',
];

const status = z.enum(STATUSES, { error: `Status must be one of: ${STATUSES.join(', ')}` });
const date = z.iso.date({ error: 'Use the YYYY-MM-DD date format' });

// Optional column: blank strings become null, and null clears the value on update
const nullable = (schema) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    schema.nullable().optional()
  );

const requiredText = (label, max) =>
  z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(max);

const companyName = requiredText('Company name', 150);
const jobTitle = requiredText('Job title', 150);

const optionalFields = {
  jobDescription: nullable(z.string().trim().max(50000)),
  jobUrl: nullable(
    z.string().trim().max(500)
      .pipe(z.url({ protocol: /^https?$/, error: 'Enter a valid http(s) URL' }))
  ),
  location: nullable(z.string().trim().max(100)),
  notes: nullable(z.string().trim().max(10000)),
  status: status.optional(),
  appliedOn: nullable(date),
  nextFollowUpOn: nullable(date),
};

export const createApplicationSchema = z.object({ companyName, jobTitle, ...optionalFields });

export const updateApplicationSchema = z
  .object({ companyName: companyName.optional(), jobTitle: jobTitle.optional(), ...optionalFields })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'Provide at least one field to update',
  });

export const updateStatusSchema = z.object({ status });

export const applicationIdSchema = z.object({
  id: z.coerce.number({ error: 'Invalid application id' }).int().positive().max(4294967295),
});

// Query strings arrive as text; "?status=" is treated as not provided
const queryParam = (schema) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

export const listApplicationsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(10),
    status: queryParam(status),
    company: queryParam(z.string().trim().max(150)),
    search: queryParam(z.string().trim().max(200)),
    dateFrom: queryParam(date),
    dateTo: queryParam(date),
    sortBy: z.enum(SORT_FIELDS, { error: `sortBy must be one of: ${SORT_FIELDS.join(', ')}` })
      .default('createdAt'),
    sortOrder: z.enum(['asc', 'desc'], { error: 'sortOrder must be asc or desc' }).default('desc'),
  })
  .refine((q) => !q.dateFrom || !q.dateTo || q.dateFrom <= q.dateTo, {
    message: 'dateFrom must be on or before dateTo',
    path: ['dateFrom'],
  });
