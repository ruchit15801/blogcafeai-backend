import { z } from 'zod';
import BlogPost from '../models/BlogPost.model.js';

const schema = z.object({ page: z.string().optional(), limit: z.string().optional() });

export async function listUserPosts(req, res, next) {
    try {
        const { userId } = req.params;
        const input = schema.parse(req.query);
        const page = Math.max(parseInt(input.page || '1', 10), 1);
        const limit = Math.min(Math.max(parseInt(input.limit || '10', 10), 1), 50);
        const filter = { status: 'published', author: userId };
        const [data, total] = await Promise.all([
            BlogPost.find(filter).sort({ publishedAt: -1 }).skip((page - 1) * limit).limit(limit).select('title slug summary bannerImageUrl publishedAt'),
            BlogPost.countDocuments(filter),
        ]);
        res.json({ success: true, data, meta: { page, limit, total } });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query', details: err.flatten() } });
        return next(err);
    }
}


