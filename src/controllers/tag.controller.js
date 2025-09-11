import { z } from 'zod';
import slugify from 'slugify';
import Tag from '../models/Tag.model.js';

export async function listTags(_req, res) {
    const tags = await Tag.find().sort({ name: 1 }).select('name slug');
    res.json({ success: true, data: tags });
}

const upsertSchema = z.object({ name: z.string().min(1) });

export async function adminCreateTag(req, res, next) {
    try {
        const input = upsertSchema.parse(req.body);
        const slug = slugify(input.name, { lower: true, strict: true });
        const tag = await Tag.create({ name: input.name, slug });
        res.status(201).json({ success: true, tag });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
}

export async function adminUpdateTag(req, res, next) {
    try {
        const { id } = req.params;
        const input = upsertSchema.partial().parse(req.body);
        const tag = await Tag.findById(id);
        if (!tag) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tag not found' } });
        if (input.name) {
            tag.name = input.name;
            tag.slug = slugify(input.name, { lower: true, strict: true });
        }
        await tag.save();
        res.json({ success: true, tag });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
}

export async function adminDeleteTag(req, res) {
    await Tag.findByIdAndDelete(req.params.id);
    res.json({ success: true });
}


