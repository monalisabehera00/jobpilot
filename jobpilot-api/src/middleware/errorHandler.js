export function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// Express 5 forwards errors from async handlers here automatically
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Invalid JSON body.' });
  }
  // Unique-constraint violation, e.g. two sign-ups with the same email at the same moment
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ message: 'Duplicate entry.' });
  }

  console.error(err);
  res.status(err.status || 500).json({ message: 'Something went wrong.' });
}
