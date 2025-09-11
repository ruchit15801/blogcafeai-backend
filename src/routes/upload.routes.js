import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../security/auth.js';
import { getPresignedUploadUrl } from '../utils/s3.js';

const router = Router();
const schema = z.object({ contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/avif']) });

router.post('/presign', authMiddleware, async (req, res, next) => {
    try {
        const input = schema.parse(req.body);
        const result = await getPresignedUploadUrl({ contentType: input.contentType });
        res.json({ success: true, ...result });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
});

export default router;


