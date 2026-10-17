import { fileURLToPath } from 'node:url';
import swaggerJsdoc from 'swagger-jsdoc';

const STATUSES = ['Wishlist', 'Applied', 'Interview', 'Offer', 'Rejected'];
const nullableString = { type: 'string', nullable: true };
const nullableDate = { type: 'string', format: 'date', nullable: true, example: '2026-10-04' };

const message = (example) => ({
  description: example,
  content: {
    'application/json': { schema: { $ref: '#/components/schemas/Error' }, example: { message: example } },
  },
});

// Shared building blocks; each route documents itself with an @openapi comment in src/routes
const definition = {
  openapi: '3.0.3',
  info: {
    title: 'JobPilot API',
    version: '1.0.0',
    description:
      'AI-powered job application tracker. Log in with **POST /auth/login**, click **Authorize** and paste the token to try the protected endpoints.',
  },
  servers: [{ url: '/api' }],
  security: [{ bearerAuth: [] }],
  tags: [
    { name: 'Auth' },
    { name: 'Applications' },
    { name: 'Resumes' },
    { name: 'AI match' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    parameters: {
      IdPath: {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'integer', minimum: 1 },
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
      },
      ValidationError: {
        type: 'object',
        properties: {
          message: { type: 'string', example: 'Validation failed' },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: { field: { type: 'string' }, message: { type: 'string' } },
            },
          },
        },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
        },
      },
      AuthResponse: {
        type: 'object',
        properties: { token: { type: 'string' }, user: { $ref: '#/components/schemas/User' } },
      },
      ApplicationStatus: { type: 'string', enum: STATUSES },
      ApplicationInput: {
        type: 'object',
        required: ['companyName', 'jobTitle'],
        properties: {
          companyName: { type: 'string', maxLength: 150, example: 'Acme' },
          jobTitle: { type: 'string', maxLength: 150, example: 'Backend Engineer' },
          status: { $ref: '#/components/schemas/ApplicationStatus' },
          jobDescription: { ...nullableString, maxLength: 50000 },
          jobUrl: { ...nullableString, format: 'uri', maxLength: 500 },
          location: { ...nullableString, maxLength: 100 },
          notes: { ...nullableString, maxLength: 10000 },
          appliedOn: nullableDate,
          nextFollowUpOn: nullableDate,
        },
      },
      Application: {
        allOf: [
          { $ref: '#/components/schemas/ApplicationInput' },
          {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              createdAt: { type: 'string', example: '2026-10-04 09:30:00' },
              updatedAt: { type: 'string', example: '2026-10-04 09:30:00' },
            },
          },
        ],
      },
      PaginatedApplications: {
        type: 'object',
        properties: {
          data: { type: 'array', items: { $ref: '#/components/schemas/Application' } },
          pagination: {
            type: 'object',
            properties: {
              page: { type: 'integer' },
              limit: { type: 'integer' },
              total: { type: 'integer' },
              totalPages: { type: 'integer' },
            },
          },
        },
      },
      Resume: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          fileName: { type: 'string', example: 'jane-doe-cv.pdf' },
          isDefault: { type: 'boolean' },
          textLength: { type: 'integer' },
          preview: { type: 'string', description: 'First 200 characters of the extracted text' },
          uploadedAt: { type: 'string', example: '2026-10-04 09:30:00' },
        },
      },
      ResumeWithText: {
        allOf: [
          { $ref: '#/components/schemas/Resume' },
          { type: 'object', properties: { extractedText: { type: 'string' } } },
        ],
      },
      MatchAnalysis: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          applicationId: { type: 'integer' },
          resumeId: { type: 'integer' },
          resumeFileName: { type: 'string' },
          score: { type: 'integer', minimum: 0, maximum: 100, example: 72 },
          matchedSkills: { type: 'array', items: { type: 'string' }, example: ['Node.js', 'MySQL'] },
          missingSkills: { type: 'array', items: { type: 'string' }, example: ['Docker'] },
          suggestions: { type: 'array', items: { type: 'string' } },
          model: { type: 'string', example: 'claude-opus-5-5' },
          createdAt: { type: 'string', example: '2026-10-04 09:30:00' },
        },
      },
      AiError: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          code: {
            type: 'string',
            enum: [
              'LLM_TIMEOUT',
              'LLM_RATE_LIMITED',
              'LLM_UNAVAILABLE',
              'LLM_NOT_CONFIGURED',
              'LLM_INVALID_RESPONSE',
              'LLM_REQUEST_FAILED',
              'LLM_REFUSED',
            ],
          },
        },
      },
    },
    responses: {
      Unauthorized: message('Missing or invalid Authorization header.'),
      NotFound: message('Not found.'),
      ValidationFailed: {
        description: 'Validation failed',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ValidationError' } } },
      },
    },
  },
};

export const openApiSpec = swaggerJsdoc({
  definition,
  // Glob patterns need forward slashes, including on Windows
  apis: [`${fileURLToPath(new URL('../routes/', import.meta.url)).replace(/\\/g, '/')}*.js`],
});
