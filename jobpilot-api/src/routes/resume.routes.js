import { Router } from 'express';
import {
  uploadResume,
  listResumes,
  getResume,
  setDefaultResume,
  deleteResume,
} from '../controllers/resume.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { acceptResumePdf } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { resumeIdSchema } from '../validators/resume.schema.js';

const router = Router();
const validateId = validate(resumeIdSchema, 'params');

// Auth runs first so unauthenticated uploads are rejected before the file is read
router.use(requireAuth);

/**
 * @openapi
 * /resumes:
 *   post:
 *     tags: [Resumes]
 *     summary: Upload a PDF resume (max 5 MB); its text is extracted and stored
 *     description: The PDF itself is not stored. A user's first resume becomes the default.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [resume]
 *             properties:
 *               resume: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: Uploaded
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Resume' }
 *       400:
 *         description: Missing file, not a PDF, or wrong form field
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       413:
 *         description: File larger than 5 MB
 *       422:
 *         description: No text could be extracted (scanned, encrypted or corrupt PDF)
 *   get:
 *     tags: [Resumes]
 *     summary: List your resumes (default first)
 *     responses:
 *       200:
 *         description: Resumes without their full text
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/Resume' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.post('/', acceptResumePdf, uploadResume);
router.get('/', listResumes);

/**
 * @openapi
 * /resumes/{id}:
 *   parameters:
 *     - $ref: '#/components/parameters/IdPath'
 *   get:
 *     tags: [Resumes]
 *     summary: Get one resume including its extracted text
 *     responses:
 *       200:
 *         description: The resume
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ResumeWithText' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     tags: [Resumes]
 *     summary: Delete a resume (the newest remaining one becomes default if needed)
 *     responses:
 *       204: { description: Deleted }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', validateId, getResume);
router.delete('/:id', validateId, deleteResume);

/**
 * @openapi
 * /resumes/{id}/default:
 *   patch:
 *     tags: [Resumes]
 *     summary: Make this your default resume
 *     parameters:
 *       - $ref: '#/components/parameters/IdPath'
 *     responses:
 *       200:
 *         description: The new default resume
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Resume' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id/default', validateId, setDefaultResume);

export default router;
