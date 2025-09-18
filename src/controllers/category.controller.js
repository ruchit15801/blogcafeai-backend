import { z } from 'zod';
import slugify from 'slugify';
import Category from '../models/Category.model.js';
import { uploadBufferToS3 } from '../utils/s3.js';

export async function listCategories(_req, res) {
    const cats = await Category.find().sort({ name: 1 }).select('name slug description imageUrl');
    res.json({ success: true, data: cats });
}

const upsertSchema = z.object({ name: z.string().min(2), description: z.string().optional() });

export async function adminCreateCategory(req, res, next) {
    try {
        const input = upsertSchema.parse(req.body);
        const slug = slugify(input.name, { lower: true, strict: true });
        let imageUrl;
        if (req.file && req.file.buffer) {
            const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
            if (!allowed.includes(req.file.mimetype)) {
                return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid image type' } });
            }
            const uploaded = await uploadBufferToS3({ buffer: req.file.buffer, contentType: req.file.mimetype, keyPrefix: 'category-images' });
            imageUrl = uploaded.publicUrl;
        }
        const cat = await Category.create({ name: input.name, description: input.description, slug, imageUrl });
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
        if (req.file && req.file.buffer) {
            const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
            if (!allowed.includes(req.file.mimetype)) {
                return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid image type' } });
            }
            const uploaded = await uploadBufferToS3({ buffer: req.file.buffer, contentType: req.file.mimetype, keyPrefix: 'category-images' });
            cat.imageUrl = uploaded.publicUrl;
        }
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


