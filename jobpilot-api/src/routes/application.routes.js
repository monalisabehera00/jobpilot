import { Router } from 'express';
import {
  createApplication,
  listApplications,
  getApplication,
  updateApplication,
  updateApplicationStatus,
  deleteApplication,
} from '../controllers/application.controller.js';
import { createMatch, listMatches } from '../controllers/match.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createApplicationSchema,
  updateApplicationSchema,
  updateStatusSchema,
  applicationIdSchema,
  listApplicationsQuerySchema,
} from '../validators/application.schema.js';
import { createMatchSchema } from '../validators/match.schema.js';

const router = Router();
const validateId = validate(applicationIdSchema, 'params');

router.use(requireAuth);

/**
 * @openapi
 * /applications:
 *   get:
 *     tags: [Applications]
 *     summary: List your applications (paginated, filterable, sortable)
 *     parameters:
 *       - { name: page, in: query, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { name: limit, in: query, schema: { type: integer, minimum: 1, maximum: 100, default: 10 } }
 *       - { name: status, in: query, schema: { $ref: '#/components/schemas/ApplicationStatus' } }
 *       - { name: company, in: query, description: Partial company name match, schema: { type: string } }
 *       - { name: search, in: query, description: Searches title, company, location and notes, schema: { type: string } }
 *       - { name: dateFrom, in: query, description: Applied on or after (YYYY-MM-DD), schema: { type: string, format: date } }
 *       - { name: dateTo, in: query, description: Applied on or before (YYYY-MM-DD), schema: { type: string, format: date } }
 *       - name: sortBy
 *         in: query
 *         schema: { type: string, enum: [createdAt, updatedAt, appliedOn, nextFollowUpOn, companyName, jobTitle, status], default: createdAt }
 *       - { name: sortOrder, in: query, schema: { type: string, enum: [asc, desc], default: desc } }
 *     responses:
 *       200:
 *         description: One page of applications
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PaginatedApplications' }
 *       400: { $ref: '#/components/responses/ValidationFailed' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *   post:
 *     tags: [Applications]
 *     summary: Create an application (status defaults to Wishlist)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ApplicationInput' }
 *     responses:
 *       201:
 *         description: Created
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Application' }
 *       400: { $ref: '#/components/responses/ValidationFailed' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
router.get('/', validate(listApplicationsQuerySchema, 'query'), listApplications);
router.post('/', validate(createApplicationSchema), createApplication);

/**
 * @openapi
 * /applications/{id}:
 *   parameters:
 *     - $ref: '#/components/parameters/IdPath'
 *   get:
 *     tags: [Applications]
 *     summary: Get one of your applications
 *     responses:
 *       200:
 *         description: The application
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Application' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   put:
 *     tags: [Applications]
 *     summary: Update an application (send only the fields to change; null clears a field)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ApplicationInput' }
 *     responses:
 *       200:
 *         description: Updated application
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Application' }
 *       400: { $ref: '#/components/responses/ValidationFailed' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *   delete:
 *     tags: [Applications]
 *     summary: Delete an application
 *     responses:
 *       204: { description: Deleted }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.get('/:id', validateId, getApplication);
router.put('/:id', validateId, validate(updateApplicationSchema), updateApplication);
router.delete('/:id', validateId, deleteApplication);

/**
 * @openapi
 * /applications/{id}/status:
 *   patch:
 *     tags: [Applications]
 *     summary: Change only the status (used by the Kanban board)
 *     parameters:
 *       - $ref: '#/components/parameters/IdPath'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { $ref: '#/components/schemas/ApplicationStatus' }
 *     responses:
 *       200:
 *         description: Updated application
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Application' }
 *       400: { $ref: '#/components/responses/ValidationFailed' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.patch('/:id/status', validateId, validate(updateStatusSchema), updateApplicationStatus);

/**
 * @openapi
 * /applications/{id}/matches:
 *   parameters:
 *     - $ref: '#/components/parameters/IdPath'
 *   post:
 *     tags: [AI match]
 *     summary: Compare a resume with this application's job description using AI
 *     description: Uses your default resume unless resumeId is given. Can take up to a minute.
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               resumeId: { type: integer, example: 3 }
 *     responses:
 *       201:
 *         description: Saved analysis
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/MatchAnalysis' }
 *       400: { $ref: '#/components/responses/ValidationFailed' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 *       422:
 *         description: No job description or no resume, inputs too long, or the AI declined
 *       429:
 *         description: An analysis is already running, or the AI service is rate limited (see Retry-After)
 *         headers:
 *           Retry-After: { schema: { type: integer }, description: Seconds to wait }
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AiError' }
 *       502:
 *         description: The AI returned an invalid response
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AiError' }
 *       503:
 *         description: The AI service is unavailable or not configured
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AiError' }
 *       504:
 *         description: The AI analysis timed out
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AiError' }
 *   get:
 *     tags: [AI match]
 *     summary: List saved analyses for this application (newest first)
 *     responses:
 *       200:
 *         description: Analyses
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/MatchAnalysis' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.post('/:id/matches', validateId, validate(createMatchSchema), createMatch);
router.get('/:id/matches', validateId, listMatches);

export default router;
