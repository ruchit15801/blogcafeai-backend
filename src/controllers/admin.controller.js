import { z } from 'zod';
import mongoose from "mongoose";
import slugify from 'slugify';
import sanitizeHtml from 'sanitize-html';
import User from '../models/User.model.js';
import BlogPost from '../models/BlogPost.model.js';
import Category from '../models/Category.model.js';
import Comment from '../models/Comment.model.js';
import { computeReadTimeMinutesFromHtml } from '../utils/readtime.js';
import { uploadBufferToS3 } from '../utils/s3.js';
import bcrypt from 'bcrypt';
import ContactMessage from '../models/ContactMessage.model.js';
import { sendEmail } from '../utils/mailer.js';

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
            User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).select('fullName email role createdAt avatarUrl'),
            User.countDocuments(filter),
        ]);
        // Aggregate post counts per user
        const authorIds = data.map((u) => u._id);
        let countsByAuthor = {};
        if (authorIds.length) {
            const countDocs = await BlogPost.aggregate([
                { $match: { author: { $in: authorIds } } },
                {
                    $group: {
                        _id: '$author',
                        totalPosts: { $sum: 1 },
                        totalScheduledPosts: {
                            $sum: { $cond: [{ $eq: ['$status', 'scheduled'] }, 1, 0] },
                        },
                    },
                },
            ]);
            countsByAuthor = Object.fromEntries(
                countDocs.map((d) => [String(d._id), { totalPosts: d.totalPosts, totalScheduledPosts: d.totalScheduledPosts }])
            );
        }

        const enriched = data.map((u) => {
            const counts = countsByAuthor[String(u._id)] || { totalPosts: 0, totalScheduledPosts: 0 };
            return {
                _id: u._id,
                fullName: u.fullName,
                avatarUrl: u.avatarUrl || u.avatar || '',
                email: u.email,
                role: u.role,
                createdAt: u.createdAt,
                totalPosts: counts.totalPosts,
                totalScheduledPosts: counts.totalScheduledPosts,
            };
        });

        res.json({ success: true, data: enriched, meta: { page, limit, total } });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query', details: err.flatten() } });
        return next(err);
    }
}

const listPostsSchema = z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    userId: z.string().optional(),
    q: z.string().optional(),
    status: z.enum(['draft', 'published', 'scheduled', 'auto-generated']).optional(),
    sort: z.enum(['latest', 'publishedAt', 'views', 'featured', 'trending']).optional(),
});


export async function listAllPosts(req, res, next) {
    try {
        const userData = req.user;
        const input = listPostsSchema.parse(req.query);

        const page = Math.max(parseInt(input.page || "1", 10), 1);
        const limit = Math.min(Math.max(parseInt(input.limit || "20", 10), 1), 100);

        const match = { status: 'published' };
        // ✅ Determine author logic (priority: input.userId > req.user.id)
        let authorId = input.userId ? input.userId : userData?.id;
        if (authorId) {
            // Convert to ObjectId if valid
            if (mongoose.Types.ObjectId.isValid(authorId)) {
                match.author = new mongoose.Types.ObjectId(authorId);
            } else {
                return res.status(400).json({
                    success: false,
                    error: { code: "INVALID_ID", message: "Invalid userId or author ID" },
                });
            }
        }

        // 🔍 Optional filters
        if (input.q) match.title = { $regex: input.q, $options: "i" };
        if (input.status) match.status = input.status;

        // 🧭 Sorting options
        let sort = { createdAt: -1 };
        switch (input.sort) {
            case "publishedAt":
                sort = { publishedAt: -1 };
                break;
            case "views":
                sort = { views: -1 };
                break;
            case "featured":
                sort = { isFeatured: -1, createdAt: -1 };
                break;
            case "trending":
                sort = { trendScore: -1 };
                break;
        }

        // 🗂️ Fetch posts and total count
        const [posts, total] = await Promise.all([
            BlogPost.find(match)
                .sort(sort)
                .skip((page - 1) * limit)
                .limit(limit)
                .populate("author", "fullName email avatarUrl role"),
            BlogPost.countDocuments(match),
        ]);

        return res.json({
            success: true,
            data: posts,
            meta: { page, limit, total },
        });
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(422).json({
                success: false,
                error: {
                    code: "VALIDATION_ERROR",
                    message: "Invalid query",
                    details: err.flatten(),
                },
            });
        }
        return next(err);
    }
}

const searchUsersByNameSchema = z.object({ q: z.string().min(1), page: z.string().optional(), limit: z.string().optional() });

export async function searchUsersByName(req, res, next) {
    try {
        const input = searchUsersByNameSchema.parse(req.query);
        const page = Math.max(parseInt(input.page || '1', 10), 1);
        const limit = Math.min(Math.max(parseInt(input.limit || '20', 10), 1), 100);
        const filter = { fullName: new RegExp(input.q, 'i') };

        const [users, total] = await Promise.all([
            User.find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .select('fullName email role createdAt avatarUrl'),
            User.countDocuments(filter),
        ]);

        res.json({ success: true, data: users, meta: { page, limit, total } });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query', details: err.flatten() } });
        return next(err);
    }
}

// Admin: create post
const adminCreateSchema = z.object({
    title: z.string().min(3),
    subtitle: z.string().optional(),
    contentHtml: z.string().min(10),
    bannerImageUrl: z.string().url().optional(),
    imageUrls: z.array(z.string().url()).optional(),
    categoryId: z.string().optional(),
    tags: z.array(z.string()).optional(),
    status: z.enum(['draft', 'published', 'scheduled']).default('draft'),
    publishedAt: z.string().optional(),
    authorId: z.string().optional(),
});

export async function adminCreatePost(req, res, next) {
    try {
        const body = { ...req.body };
        if (typeof body.imageUrls === 'string') body.imageUrls = [body.imageUrls];
        if (typeof body.tags === 'string') body.tags = [body.tags];
        if (Array.isArray(body.tags)) body.tags = body.tags.filter(Boolean);
        if (Array.isArray(body.imageUrls)) body.imageUrls = body.imageUrls.filter(Boolean);
        // Handle file uploads if provided
        const files = req.files || {};
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
        if (files.bannerImage && files.bannerImage[0]) {
            const file = files.bannerImage[0];
            if (!allowed.includes(file.mimetype)) {
                return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid banner image type' } });
            }
            const uploaded = await uploadBufferToS3({ buffer: file.buffer, contentType: file.mimetype, keyPrefix: 'post-banners' });
            body.bannerImageUrl = uploaded.publicUrl;
        }
        if (files.images && Array.isArray(files.images) && files.images.length > 0) {
            const uploads = [];
            for (const file of files.images) {
                if (!allowed.includes(file.mimetype)) continue;
                uploads.push(uploadBufferToS3({ buffer: file.buffer, contentType: file.mimetype, keyPrefix: 'post-images' }));
            }
            const results = await Promise.all(uploads);
            const urls = results.map(r => r.publicUrl);
            body.imageUrls = Array.isArray(body.imageUrls) ? [...body.imageUrls, ...urls] : urls;
        }

        const input = adminCreateSchema.parse(body);
        if (input.status === 'scheduled') {
            const when = input.publishedAt ? new Date(input.publishedAt) : null;
            if (!when) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'publishedAt required for scheduled post' } });
            if (when <= new Date()) input.status = 'published';
        }

        let baseSlug = slugify(input.title, { lower: true, strict: true });
        let slug = baseSlug;
        let n = 1;
        while (await BlogPost.exists({ slug })) {
            slug = `${baseSlug}-${n++}`;
        }
        const sanitized = sanitizeHtml(input.contentHtml);
        const readingTimeMinutes = computeReadTimeMinutesFromHtml(sanitized);

        const post = await BlogPost.create({
            title: input.title,
            subtitle: input.subtitle,
            contentHtml: sanitized,
            summary: sanitized.replace(/<[^>]+>/g, '').slice(0, 250),
            bannerImageUrl: input.bannerImageUrl,
            imageUrls: input.imageUrls || [],
            category: input.categoryId || undefined,
            tags: input.tags || [],
            author: input.authorId || req.user.id,
            status: input.status,
            publishedAt: input.publishedAt ? new Date(input.publishedAt) : undefined,
            slug,
            readingTimeMinutes,
        });
        res.status(201).json({ success: true, post });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
}

// Admin: update post
const adminUpdateSchema = adminCreateSchema.partial();

export async function adminUpdatePost(req, res, next) {
    try {
        const { id } = req.params;
        const body = { ...req.body };

        if (typeof body.imageUrls === 'string') body.imageUrls = [body.imageUrls];
        if (typeof body.tags === 'string') body.tags = [body.tags];
        if (Array.isArray(body.tags)) body.tags = body.tags.filter(Boolean);
        if (Array.isArray(body.imageUrls)) body.imageUrls = body.imageUrls.filter(Boolean);

        // Handle new uploads
        const files = req.files || {};
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

        // Handle banner image upload
        if (files.bannerImage && files.bannerImage[0]) {
            const file = files.bannerImage[0];
            if (!allowed.includes(file.mimetype)) {
                return res.status(422).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'Invalid banner image type' },
                });
            }
            const uploaded = await uploadBufferToS3({
                buffer: file.buffer,
                contentType: file.mimetype,
                keyPrefix: 'post-banners',
            });
            body.bannerImageUrl = uploaded.publicUrl;
        }

        // Handle multiple image uploads — REPLACE mode
        if (files.images && Array.isArray(files.images) && files.images.length > 0) {
            const uploads = [];
            for (const file of files.images) {
                if (!allowed.includes(file.mimetype)) continue;
                uploads.push(
                    uploadBufferToS3({
                        buffer: file.buffer,
                        contentType: file.mimetype,
                        keyPrefix: 'post-images',
                    })
                );
            }
            const results = await Promise.all(uploads);
            const urls = results.map((r) => r.publicUrl);
            // 🔁 Replace existing imageUrls with newly uploaded ones
            body.imageUrls = urls;
        }

        const input = adminUpdateSchema.parse(body);

        if (input.status === 'scheduled') {
            const when = input.publishedAt ? new Date(input.publishedAt) : null;
            if (!when) {
                return res.status(422).json({
                    success: false,
                    error: { code: 'VALIDATION_ERROR', message: 'publishedAt required for scheduled post' },
                });
            }
            if (when <= new Date()) input.status = 'published';
        }

        const post = await BlogPost.findById(id);
        if (!post) {
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'Post not found' },
            });
        }

        // ✅ Update fields
        if (input.title) post.title = input.title;
        if (input.subtitle !== undefined) post.subtitle = input.subtitle;

        if (input.contentHtml) {
            post.contentHtml = sanitizeHtml(input.contentHtml);
            post.readingTimeMinutes = computeReadTimeMinutesFromHtml(post.contentHtml);
            post.summary = post.contentHtml.replace(/<[^>]+>/g, '').slice(0, 250);
        }

        if (input.bannerImageUrl !== undefined) post.bannerImageUrl = input.bannerImageUrl;

        // ✅ Replace imageUrls instead of appending
        if (Array.isArray(input.imageUrls)) {
            post.imageUrls = input.imageUrls;
        }

        if (input.categoryId !== undefined) post.category = input.categoryId;
        if (Array.isArray(input.tags)) post.tags = input.tags;
        if (input.status) post.status = input.status;
        if (input.publishedAt !== undefined)
            post.publishedAt = input.publishedAt ? new Date(input.publishedAt) : undefined;
        if (input.authorId) post.author = input.authorId;

        // Slug update
        if (input.title) {
            let baseSlug = slugify(input.title, { lower: true, strict: true });
            let slug = baseSlug;
            let n = 1;
            while (await BlogPost.exists({ slug, _id: { $ne: id } })) {
                slug = `${baseSlug}-${n++}`;
            }
            post.slug = slug;
        }

        await post.save();

        res.json({ success: true, post });
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(422).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() },
            });
        }
        return next(err);
    }
}

// Admin: delete post
export async function adminDeletePost(req, res, next) {
    try {
        const { id } = req.params;
        const post = await BlogPost.findById(id);
        if (!post) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Post not found' } });
        await post.deleteOne();
        res.json({ success: true });
    } catch (err) {
        return next(err);
    }
}

// Admin: list scheduled posts
const listScheduledSchema = z.object({ page: z.string().optional(), limit: z.string().optional(), q: z.string().optional(), userId: z.string().optional() });

export async function listScheduledPosts(req, res, next) {
    try {
        const input = listScheduledSchema.parse(req.query);
        const page = Math.max(parseInt(input.page || '1', 10), 1);
        const limit = Math.min(Math.max(parseInt(input.limit || '20', 10), 1), 100);
        const match = { status: 'scheduled' };
        if (input.userId) match.author = input.userId;
        if (input.q) match.title = { $regex: input.q, $options: 'i' };

        const [posts, total] = await Promise.all([
            BlogPost.find(match)
                .sort({ publishedAt: 1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .select('title status author readingTimeMinutes tags bannerImageUrl imageUrls createdAt publishedAt isFeatured views slug')
                .populate('author', 'fullName email avatarUrl role'),
            BlogPost.countDocuments(match),
        ]);
        res.json({ success: true, data: posts, meta: { page, limit, total } });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query', details: err.flatten() } });
        return next(err);
    }
}

// Admin: create scheduled post
const createScheduledSchema = adminCreateSchema.extend({ status: z.literal('scheduled'), publishedAt: z.string() });

export async function adminCreateScheduledPost(req, res, next) {
    try {
        const body = { ...req.body };
        if (typeof body.imageUrls === 'string') body.imageUrls = [body.imageUrls];
        if (typeof body.tags === 'string') body.tags = [body.tags];
        if (Array.isArray(body.tags)) body.tags = body.tags.filter(Boolean);
        if (Array.isArray(body.imageUrls)) body.imageUrls = body.imageUrls.filter(Boolean);
        // Handle file uploads if provided
        const files = req.files || {};
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
        if (files.bannerImage && files.bannerImage[0]) {
            const file = files.bannerImage[0];
            if (!allowed.includes(file.mimetype)) {
                return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid banner image type' } });
            }
            const uploaded = await uploadBufferToS3({ buffer: file.buffer, contentType: file.mimetype, keyPrefix: 'post-banners' });
            body.bannerImageUrl = uploaded.publicUrl;
        }
        if (files.images && Array.isArray(files.images) && files.images.length > 0) {
            const uploads = [];
            for (const file of files.images) {
                if (!allowed.includes(file.mimetype)) continue;
                uploads.push(uploadBufferToS3({ buffer: file.buffer, contentType: file.mimetype, keyPrefix: 'post-images' }));
            }
            const results = await Promise.all(uploads);
            const urls = results.map(r => r.publicUrl);
            body.imageUrls = Array.isArray(body.imageUrls) ? [...body.imageUrls, ...urls] : urls;
        }
        const input = createScheduledSchema.parse(body);
        // Force scheduled; publishedAt must be in future
        const when = new Date(input.publishedAt);
        if (!(when instanceof Date) || Number.isNaN(when.getTime())) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid publishedAt' } });
        if (when <= new Date()) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'publishedAt must be in the future' } });

        let baseSlug = slugify(input.title, { lower: true, strict: true });
        let slug = baseSlug;
        let n = 1;
        while (await BlogPost.exists({ slug })) {
            slug = `${baseSlug}-${n++}`;
        }
        const sanitized = sanitizeHtml(input.contentHtml);
        const readingTimeMinutes = computeReadTimeMinutesFromHtml(sanitized);
        const post = await BlogPost.create({
            title: input.title,
            subtitle: input.subtitle,
            contentHtml: sanitized,
            summary: sanitized.replace(/<[^>]+>/g, '').slice(0, 250),
            bannerImageUrl: input.bannerImageUrl,
            imageUrls: input.imageUrls || [],
            category: input.categoryId || undefined,
            tags: input.tags || [],
            author: input.authorId || req.user.id,
            status: 'scheduled',
            publishedAt: when,
            slug,
            readingTimeMinutes,
        });
        res.status(201).json({ success: true, post });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
}

// Admin: publish a scheduled post now
export async function adminPublishPostNow(req, res, next) {
    try {
        const { id } = req.params;
        const post = await BlogPost.findById(id);
        if (!post) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Post not found' } });
        post.status = 'published';
        if (!post.publishedAt || post.publishedAt > new Date()) post.publishedAt = new Date();
        await post.save();
        res.json({ success: true, post });
    } catch (err) {
        return next(err);
    }
}

// user 
const updateSchema = z.object({
    role: z.enum(["user", "admin"]).optional(),
    fullName: z.string().min(1).optional(),
    avatar: z.string().url().optional(), 
});

export async function updateUser(req, res, next) {
    try {
        const input = updateSchema.parse(req.body);
        const user = await User.findById(req.params.id);
        if (!user)
            return res.status(404).json({
                success: false,
                error: { code: 'NOT_FOUND', message: 'User not found' }
            });

        // Update fullName & role
        if (input.fullName) user.fullName = input.fullName;
        if (input.role) user.role = input.role;

        // Update avatar if file uploaded
        if (req.file) {
            const { publicUrl } = await uploadBufferToS3({
                buffer: req.file.buffer,
                contentType: req.file.mimetype,
                keyPrefix: `users/${user._id}/avatar`
            });
            user.avatar = publicUrl;
            user.avatarUrl = publicUrl;
        }

        await user.save();

        res.json({
            success: true,
            user: {
                _id: user._id,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
                avatar: user.avatar // new avatar URL
            }
        });
    } catch (err) {
        if (err instanceof z.ZodError)
            return res.status(422).json({
                success: false,
                error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() }
            });
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


const adminChangePasswordSchema = z.object({ newPassword: z.string().min(6) });

export async function changeUserPassword(req, res, next) {
    try {
        const { id } = req.params;
        const { newPassword } = adminChangePasswordSchema.parse(req.body || {});
        const user = await User.findById(id);
        if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
        user.passwordHash = await bcrypt.hash(newPassword, 10);
        await user.save();
        res.json({ success: true });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
}
const adminProfileUpdateSchema = z.object({
    fullName: z.string().min(2).max(80).optional(),
    twitterUrl: z.string().url().optional(),
    facebookUrl: z.string().url().optional(),
    instagramUrl: z.string().url().optional(),
    linkedinUrl: z.string().url().optional(),
});

export async function getAdminProfile(req, res, next) {
    try {
        const user = await User.findById(req.user.id).select('fullName email avatarUrl role createdAt bio twitterUrl facebookUrl instagramUrl linkedinUrl');
        if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
        res.json({ success: true, data: user });
    } catch (err) {
        return next(err);
    }
}

export async function updateAdminProfile(req, res, next) {
    try {
        const input = adminProfileUpdateSchema.parse(req.body || {});
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });

        if (input.fullName) user.fullName = input.fullName;
        if (input.twitterUrl !== undefined) user.twitterUrl = input.twitterUrl;
        if (input.facebookUrl !== undefined) user.facebookUrl = input.facebookUrl;
        if (input.instagramUrl !== undefined) user.instagramUrl = input.instagramUrl;
        if (input.linkedinUrl !== undefined) user.linkedinUrl = input.linkedinUrl;

        // optional avatar upload
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

// Admin: list contact messages
const listContactSchema = z.object({ page: z.string().optional(), limit: z.string().optional(), status: z.enum(['new', 'read']).optional(), q: z.string().optional() });
export async function listContactMessages(req, res, next) {
    try {
        const input = listContactSchema.parse(req.query);
        const page = Math.max(parseInt(input.page || '1', 10), 1);
        const limit = Math.min(Math.max(parseInt(input.limit || '20', 10), 1), 100);
        const filter = {};
        if (input.status) filter.status = input.status;
        if (input.q) filter.$or = [{ name: new RegExp(input.q, 'i') }, { email: new RegExp(input.q, 'i') }, { message: new RegExp(input.q, 'i') }];
        const [data, total] = await Promise.all([
            ContactMessage.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).select('name email message status createdAt'),
            ContactMessage.countDocuments(filter),
        ]);
        res.json({ success: true, data, meta: { page, limit, total } });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query', details: err.flatten() } });
        return next(err);
    }
}

export async function fetchContactMessageById(req, res, next) {
    try {
        const { id } = req.params;

        const msg = await ContactMessage.findById(id);
        if (!msg)
            return res.status(404).json({
                success: false,
                error: { code: "NOT_FOUND", message: "Message not found" },
            });

        res.json({
            success: true,
            data: msg,
        });
    } catch (err) {
        return next(err);
    }
}


// Admin: mark contact message as read
export async function markContactMessageRead(req, res, next) {
    try {
        const { id } = req.params;
        const msg = await ContactMessage.findById(id);
        if (!msg) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Message not found' } });
        msg.status = 'read';
        await msg.save();
        res.json({ success: true });
    } catch (err) {
        return next(err);
    }
}


// Admin: reply to a contact message via email
const replyContactSchema = z.object({ subject: z.string().min(1), messageHtml: z.string().min(1).or(z.string().min(1)) });
export async function replyToContactMessage(req, res, next) {
    try {
        const { id } = req.params;
        const input = replyContactSchema.parse(req.body || {});
        const msg = await ContactMessage.findById(id);
        if (!msg) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Message not found' } });

        const to = msg.email;
        const subject = input.subject;
        const html = input.messageHtml;
        await sendEmail({ to, subject, html });

        msg.sentEmail = {
            subject: subject,
            body: html,
            sentAt: new Date().toISOString(),
        };

        // Mark as read
        msg.status = 'read';

        await msg.save();

        // optionally mark as read after reply
        // if (msg.status !== 'read') {
        //     msg.status = 'read';
        //     await msg.save();
        // }

        res.json({ success: true, data: msg });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
}

// Admin: get single post by ID
export async function fetchPostById(req, res, next) {
    try {
        const { id } = req.params;
        const post = await BlogPost.findById(id)
            .populate('author', 'fullName email avatarUrl role twitterUrl facebookUrl instagramUrl linkedinUrl');
        if (!post) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Post not found' } });
        res.json({ success: true, post });
    } catch (err) {
        return next(err);
    }
}

export async function adminDashboard(req, res, next) {
    try {
        const adminId = req.user?.id;
        const [
            myPosts,
            totalUsers,
            totalScheduledPosts,
            totalCategories,
            totalPosts,
            totalPublishedPosts,
        ] = await Promise.all([
            BlogPost.countDocuments(adminId ? { author: adminId } : {}),
            User.countDocuments({}),
            BlogPost.countDocuments({ status: 'scheduled' }),
            Category.countDocuments({}),
            BlogPost.countDocuments({}),
            BlogPost.countDocuments({ status: 'published' }),
        ]);
        return res.json({ success: true, data: { myPosts, users: totalUsers, scheduledPosts: totalScheduledPosts, categories: totalCategories, posts: totalPosts, publishedPosts: totalPublishedPosts } });
    } catch (err) {
        return next(err);
    }
}


export async function userAllPost(req, res, next) {
    try {
        const q = listQuerySchema.parse(req.query);
        const page = Math.max(parseInt(q.page || '1', 10), 1);
        const limit = Math.min(Math.max(parseInt(q.limit || '10', 10), 1), 50);

        const filter = { status: 'published' };

        if (q.category) filter.category = q.category;
        if (q.tag) filter.tags = q.tag;

        let sort = { publishedAt: -1 };
        if (q.sort === 'featured') sort = { isFeatured: -1, publishedAt: -1 };
        if (q.sort === 'trending') sort = { trendScore: -1 };

        const query = BlogPost.find(filter)
            .populate('author', 'fullName')
            .populate('category', 'name slug')
            .populate('tags', 'name slug');

        if (q.search) {
            query.find({ $text: { $search: q.search } });
        }

        const [data, total] = await Promise.all([
            query.sort(sort).skip((page - 1) * limit).limit(limit),
            BlogPost.countDocuments(filter),
        ]);

        res.json({ success: true, data, meta: { page, limit, total } });
    } catch (err) {
        if (err instanceof z.ZodError)
            return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query', details: err.flatten() } });
        return next(err);
    }
}

