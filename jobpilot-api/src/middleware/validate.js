// Validates part of the request against a Zod schema.
// The body is replaced with the cleaned data; Express 5 makes req.query read-only,
// so cleaned query/params are stored on req.validated instead.
export const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source] ?? {});

  if (!result.success) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }

  if (source === 'body') {
    req.body = result.data;
  } else {
    req.validated = { ...req.validated, [source]: result.data };
  }
  next();
};
