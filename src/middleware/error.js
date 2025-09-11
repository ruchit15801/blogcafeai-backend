export function notFoundHandler(_req, res, _next) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } });
}

export function errorHandler(err, _req, res, _next) {
    // eslint-disable-next-line no-console
    console.error(err);
    const status = err.status || 500;
    const code = err.code || 'INTERNAL_SERVER_ERROR';
    const message = err.message || 'Something went wrong';
    const details = err.details || undefined;
    res.status(status).json({ success: false, error: { code, message, details } });
}


