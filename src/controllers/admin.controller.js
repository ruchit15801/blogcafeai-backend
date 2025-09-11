import { z } from 'zod';
import User from '../models/User.model.js';
import BlogPost from '../models/BlogPost.model.js';

const listSchema = z.object({ role: z.string().optional(), q: z.string().optional(), page: z.string().optional(), limit: z.string().optional() });

export async function listUsers(req, res, next) {
    try {
        const input = listSchema.parse(req.query);
        const page = Math.max(parseInt(input.page || '1', 10), 1);
        const limit = Math.min(Math.max(parseInt(input.limit || '20', 10), 1), 100);
        const filter = {};
        if (input.role) filter.role = input.role;
        if (input.q) filter.$or = [{ fullName: new RegExp(input.q, 'i') }, { email: new RegExp(input.q, 'i') }];
        const [data, total] = await Promise.all([
            User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).select('fullName email role createdAt'),
            User.countDocuments(filter),
        ]);
        res.json({ success: true, data, meta: { page, limit, total } });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query', details: err.flatten() } });
        return next(err);
    }
}

const updateSchema = z.object({ role: z.enum(['admin', 'user']).optional() });

export async function updateUser(req, res, next) {
    try {
        const input = updateSchema.parse(req.body);
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
        if (input.role) user.role = input.role;
        await user.save();
        res.json({ success: true, user: { _id: user._id, fullName: user.fullName, email: user.email, role: user.role } });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
}

export async function deleteUser(req, res) {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
}

const featureSchema = z.object({ isFeatured: z.boolean() });

export async function toggleFeatured(req, res, next) {
    try {
        const input = featureSchema.parse(req.body);
        const post = await BlogPost.findById(req.params.id);
        if (!post) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Post not found' } });
        post.isFeatured = input.isFeatured;
        await post.save();
        res.json({ success: true, post: { _id: post._id, isFeatured: post.isFeatured } });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
}


