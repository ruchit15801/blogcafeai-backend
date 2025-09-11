import { z } from 'zod';
import slugify from 'slugify';
import Category from '../models/Category.model.js';

export async function listCategories(_req, res) {
    const cats = await Category.find().sort({ name: 1 }).select('name slug description');
    res.json({ success: true, data: cats });
}

const upsertSchema = z.object({ name: z.string().min(2), description: z.string().optional() });

export async function adminCreateCategory(req, res, next) {
    try {
        const input = upsertSchema.parse(req.body);
        const slug = slugify(input.name, { lower: true, strict: true });
        const cat = await Category.create({ name: input.name, description: input.description, slug });
        res.status(201).json({ success: true, category: cat });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
}

export async function adminUpdateCategory(req, res, next) {
    try {
        const { id } = req.params;
        const input = upsertSchema.partial().parse(req.body);
        const cat = await Category.findById(id);
        if (!cat) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Category not found' } });
        if (input.name) {
            cat.name = input.name;
            cat.slug = slugify(input.name, { lower: true, strict: true });
        }
        if (input.description !== undefined) cat.description = input.description;
        await cat.save();
        res.json({ success: true, category: cat });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
}

export async function adminDeleteCategory(req, res) {
    await Category.findByIdAndDelete(req.params.id);
    res.json({ success: true });
}


