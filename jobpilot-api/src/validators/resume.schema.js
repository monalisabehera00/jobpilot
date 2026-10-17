import { z } from 'zod';

export const resumeIdSchema = z.object({
  id: z.coerce.number({ error: 'Invalid resume id' }).int().positive().max(4294967295),
});
