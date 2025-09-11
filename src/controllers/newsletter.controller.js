import { z } from 'zod';
import NewsletterSubscriber from '../models/NewsletterSubscriber.model.js';

const schema = z.object({ email: z.string().email(), name: z.string().optional() });

export async function subscribe(req, res, next) {
    try {
        const input = schema.parse(req.body);
        const existing = await NewsletterSubscriber.findOne({ email: input.email });
        if (existing) return res.json({ success: true, already: true });
        await NewsletterSubscriber.create({ email: input.email, name: input.name });
        res.status(201).json({ success: true });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
}


