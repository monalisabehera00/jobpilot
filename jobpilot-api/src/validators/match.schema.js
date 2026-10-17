import { z } from 'zod';

// resumeId is optional: without it the user's default resume is used
export const createMatchSchema = z.object({
  resumeId: z.number({ error: 'resumeId must be a number' }).int().positive().max(4294967295).optional(),
});
