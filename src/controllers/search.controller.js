import { z } from 'zod';
import BlogPost from '../models/BlogPost.model.js';

const schema = z.object({ q: z.string().min(1), page: z.string().optional(), limit: z.string().optional() });

export async function search(req, res, next) {
    try {
        const input = schema.parse(req.query);
        const page = Math.max(parseInt(input.page || '1', 10), 1);
        const limit = Math.min(Math.max(parseInt(input.limit || '10', 10), 1), 50);
        const query = BlogPost.find({ status: 'published', $text: { $search: input.q } })
            .select('title slug summary bannerImageUrl publishedAt')
            .sort({ score: { $meta: 'textScore' } })
            .skip((page - 1) * limit)
            .limit(limit);
        const [data, total] = await Promise.all([
            query,
            BlogPost.countDocuments({ status: 'published', $text: { $search: input.q } }),
        ]);
        res.json({ success: true, data, meta: { page, limit, total } });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query', details: err.flatten() } });
        return next(err);
    }
}


