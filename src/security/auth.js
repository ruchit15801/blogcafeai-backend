import jwt from 'jsonwebtoken';

export function signAccessToken(payload) {
    const secret = process.env.JWT_SECRET || 'dev_secret';
    return jwt.sign(payload, secret, { expiresIn: process.env.JWT_EXPIRES_IN || '15m' });
}

export function signRefreshToken(payload) {
    const secret = process.env.JWT_REFRESH_SECRET || 'dev_refresh';
    return jwt.sign(payload, secret, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' });
}

export function verifyAccessToken(token) {
    const secret = process.env.JWT_SECRET || 'dev_secret';
    return jwt.verify(token, secret);
}

export function verifyRefreshToken(token) {
    const secret = process.env.JWT_REFRESH_SECRET || 'dev_refresh';
    return jwt.verify(token, secret);
}

export function authMiddleware(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing token' } });
    try {
        const decoded = verifyAccessToken(token);
        req.user = decoded;
        return next();
    } catch (e) {
        return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
    }
}

export function requireRole(role) {
    return (req, res, next) => {
        if (!req.user || (req.user.role !== role && req.user.role !== 'admin')) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } });
        }
        return next();
    };
}


