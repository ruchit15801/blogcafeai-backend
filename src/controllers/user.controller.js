import { z } from 'zod';
import BlogPost from '../models/BlogPost.model.js';
import User from '../models/User.model.js';
import Comment from '../models/Comment.model.js';
import { uploadBufferToS3 } from '../utils/s3.js';

const schema = z.object({ page: z.string().optional(), limit: z.string().optional() });

export async function listUserPosts(req, res, next) {
    try {
        console.log('req.user :>> ', req.user);
        const userId = req.user.id;
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


const profileUpdateSchema = z.object({
    fullName: z.string().min(2).max(80).optional(),
    twitterUrl: z.string().url().optional(),
    facebookUrl: z.string().url().optional(),
    instagramUrl: z.string().url().optional(),
    linkedinUrl: z.string().url().optional(),
});

export async function getMyProfile(req, res, next) {
    try {
        const user = await User.findById(req.user.id).select('fullName email avatarUrl role createdAt twitterUrl facebookUrl instagramUrl linkedinUrl');
        if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
        res.json({ success: true, data: user });
    } catch (err) {
        return next(err);
    }
}

export async function updateMyProfile(req, res, next) {
    try {
        const input = profileUpdateSchema.parse(req.body || {});
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });

        if (input.fullName) user.fullName = input.fullName;
        if (input.twitterUrl !== undefined) user.twitterUrl = input.twitterUrl;
        if (input.facebookUrl !== undefined) user.facebookUrl = input.facebookUrl;
        if (input.instagramUrl !== undefined) user.instagramUrl = input.instagramUrl;
        if (input.linkedinUrl !== undefined) user.linkedinUrl = input.linkedinUrl;

        const file = req.file;
        if (file) {
            const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
            if (!allowed.includes(file.mimetype)) {
                return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid avatar image type' } });
            }
            const uploaded = await uploadBufferToS3({ buffer: file.buffer, contentType: file.mimetype, keyPrefix: 'avatars' });
            user.avatarUrl = uploaded.publicUrl;
        }

        await user.save();
        res.json({ success: true, data: { _id: user._id, fullName: user.fullName, email: user.email, avatarUrl: user.avatarUrl, role: user.role, twitterUrl: user.twitterUrl, facebookUrl: user.facebookUrl, instagramUrl: user.instagramUrl, linkedinUrl: user.linkedinUrl } });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
}

export async function userDashboard(req, res, next) {
    try {
        const userId = req.user.id;
        const [myPosts, myScheduled, myLikes, myComments] = await Promise.all([
            BlogPost.countDocuments({ author: userId }),
            BlogPost.countDocuments({ author: userId, status: 'scheduled' }),
            BlogPost.countDocuments({ author: userId, likes: { $gt: 0 } }),
            Comment.countDocuments({ author: userId }),
        ]);
        res.json({ success: true, data: { myPosts, scheduledPosts: myScheduled, likes: myLikes, comments: myComments } });
    } catch (err) {
        return next(err);
    }
}

