import jwt from 'jsonwebtoken';

export const JWT_OPTIONS = { issuer: 'jobpilot', audience: 'jobpilot-client' };

// Protects routes: expects "Authorization: Bearer <token>"
export function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Missing or invalid Authorization header.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      ...JWT_OPTIONS,
      algorithms: ['HS256'],
    });
    req.user = { id: Number(payload.sub), name: payload.name, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}
