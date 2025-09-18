import { z } from 'zod';
import slugify from 'slugify';
import sanitizeHtml from 'sanitize-html';
import BlogPost from '../models/BlogPost.model.js';
import { computeReadTimeMinutesFromHtml } from '../utils/readtime.js';
import { uploadBufferToS3 } from '../utils/s3.js';
import PostView from '../models/PostView.model.js';
import Comment from '../models/Comment.model.js';
import User from '../models/User.model.js';
import { verifyAccessToken } from '../security/auth.js';

const listQuerySchema = z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    category: z.string().optional(),
    tag: z.string().optional(),
    search: z.string().optional(),
    sort: z.enum(['latest', 'trending', 'featured']).optional(),
    authorId: z.string().optional(),
});

export async function listPosts(req, res, next) {
    try {
        const q = listQuerySchema.parse(req.query);
        const page = Math.max(parseInt(q.page || '1', 10), 1);
        const limit = Math.min(Math.max(parseInt(q.limit || '10', 10), 1), 50);
        const now = new Date();
        const filter = { status: 'published', publishedAt: { $lte: now } };
        if (q.category) filter.category = q.category;
        if (q.tag) filter.tags = q.tag;
        if (q.authorId) filter.author = q.authorId;
        let sort = { publishedAt: -1 };
        if (q.sort === 'featured') sort = { isFeatured: -1, publishedAt: -1 };
        if (q.sort === 'trending') sort = { trendScore: -1 };
        const query = BlogPost.find(filter).populate('author', 'fullName').populate('category', 'name slug').populate('tags', 'name slug');
        if (q.search) {
            query.find({ $text: { $search: q.search } });
        }
        const [data, total] = await Promise.all([
            query.sort(sort).skip((page - 1) * limit).limit(limit),
            BlogPost.countDocuments(filter),
        ]);
        res.json({ success: true, data, meta: { page, limit, total } });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid query', details: err.flatten() } });
        return next(err);
    }
}

export async function getBySlug(req, res, next) {
    try {
        const { slug } = req.params;
        const post = await BlogPost.findOne({ slug, status: 'published', publishedAt: { $lte: new Date() } })
            .populate('author', 'fullName')
            .populate('category', 'name slug')
            .populate('tags', 'name slug');
        if (!post) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Post not found' } });
        // Unique view increment for authenticated users
        const userId = req.user && req.user.id;
        if (userId) {
            try {
                const created = await PostView.create({ post: post._id, user: userId });
                if (created) {
                    await BlogPost.updateOne({ _id: post._id }, { $inc: { views: 1 } });
                    post.views = (post.views || 0) + 1;
                }
            } catch (e) {
                // ignore duplicate key errors (already viewed)
            }
        } else {
            // For unauthenticated, still increment a soft view (optional). Comment out if strict unique is desired
            await BlogPost.updateOne({ _id: post._id }, { $inc: { views: 1 } });
            post.views = (post.views || 0) + 1;
        }
        const previous = await BlogPost.findOne({ status: 'published', publishedAt: { $lt: post.publishedAt } })
            .sort({ publishedAt: -1 })
            .select('title slug');
        const nextPost = await BlogPost.findOne({ status: 'published', publishedAt: { $gt: post.publishedAt } })
            .sort({ publishedAt: 1 })
            .select('title slug');
        const readNext = await BlogPost.find({ status: 'published', _id: { $ne: post._id }, category: post.category })
            .sort({ trendScore: -1 })
            .limit(5)
            .select('title slug summary');
        res.json({ success: true, post, previous: previous || null, next: nextPost || null, readNext });
    } catch (err) {
        return next(err);
    }
}

const createSchema = z.object({
    title: z.string().min(3),
    subtitle: z.string().optional(),
    contentHtml: z.string().min(10),
    bannerImageUrl: z.string().url().optional(),
    imageUrls: z.array(z.string().url()).optional(),
    categoryId: z.string().optional(),
    tags: z.array(z.string()).optional(),
    status: z.enum(['draft', 'published']).default('published'),
    publishedAt: z.string().optional(),
});

export async function createPost(req, res, next) {
    try {
        // Normalize multipart fields
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
            body.imageUrls = urls;
        }

        const input = createSchema.parse(body);
        // Scheduling rules: if scheduled, require future publishedAt; if past/now, set to published
        if (input.status === 'scheduled') {
            const when = input.publishedAt ? new Date(input.publishedAt) : null;
            if (!when) {
                return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'publishedAt required for scheduled post' } });
            }
            if (when <= new Date()) {
                // convert to immediate publish
                input.status = 'published';
            }
        }
        let baseSlug = slugify(input.title, { lower: true, strict: true });
        let slug = baseSlug;
        let n = 1;
        // ensure unique slug
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
            author: req.user.id,
            status: input.status,
            publishedAt: input.publishedAt ? new Date(input.publishedAt) : undefined,
            slug,
            readingTimeMinutes,
        });
        res.status(201).json({ success: true, post: { _id: post._id, title: post.title, slug: post.slug, author: { _id: req.user.id }, status: post.status, publishedAt: post.publishedAt || null } });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
}

const updateSchema = createSchema.partial();

export async function updatePost(req, res, next) {
    try {
        const { id } = req.params;
        const body = { ...req.body };
        if (typeof body.imageUrls === 'string') body.imageUrls = [body.imageUrls];
        if (typeof body.tags === 'string') body.tags = [body.tags];
        if (Array.isArray(body.tags)) body.tags = body.tags.filter(Boolean);
        if (Array.isArray(body.imageUrls)) body.imageUrls = body.imageUrls.filter(Boolean);

        // Handle new uploads, append to imageUrls if provided
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

        const input = updateSchema.parse(body);
        if (input.status === 'scheduled') {
            const when = input.publishedAt ? new Date(input.publishedAt) : null;
            if (!when) {
                return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'publishedAt required for scheduled post' } });
            }
            if (when <= new Date()) {
                input.status = 'published';
            }
        }
        const post = await BlogPost.findById(id);
        if (!post) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Post not found' } });
        if (String(post.author) !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot edit' } });
        if (input.title) post.title = input.title;
        if (input.subtitle !== undefined) post.subtitle = input.subtitle;
        if (input.contentHtml) {
            post.contentHtml = sanitizeHtml(input.contentHtml);
            post.readingTimeMinutes = computeReadTimeMinutesFromHtml(post.contentHtml);
        }
        if (input.bannerImageUrl !== undefined) post.bannerImageUrl = input.bannerImageUrl;
        if (input.imageUrls) post.imageUrls = input.imageUrls;
        if (input.categoryId !== undefined) post.category = input.categoryId;
        if (input.status) post.status = input.status;
        if (input.publishedAt !== undefined) post.publishedAt = input.publishedAt ? new Date(input.publishedAt) : undefined;
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
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
}

export async function deletePost(req, res, next) {
    try {
        const { id } = req.params;
        const post = await BlogPost.findById(id);
        if (!post) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Post not found' } });
        if (String(post.author) !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot delete' } });
        await post.deleteOne();
        res.json({ success: true });
    } catch (err) {
        return next(err);
    }
}

export async function publishPost(req, res, next) {
    try {
        const { id } = req.params;
        const post = await BlogPost.findById(id);
        if (!post) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Post not found' } });
        if (String(post.author) !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot publish' } });
        post.status = 'published';
        if (!post.publishedAt) post.publishedAt = new Date();
        await post.save();
        res.json({ success: true, post });
    } catch (err) {
        return next(err);
    }
}

export async function getPostMeta(req, res, next) {
    try {
        const { id } = req.params;
        const post = await BlogPost.findOne({ _id: id, status: 'published', publishedAt: { $lte: new Date() } }).select('_id views');
        if (!post) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Post not found' } });
        const [commentsCount, favoritesCount] = await Promise.all([
            Comment.countDocuments({ post: id }),
            User.countDocuments({ favorites: id }),
        ]);
        let isFavorited = false;
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : null;
        if (token) {
            try {
                const decoded = verifyAccessToken(token);
                const user = await User.findById(decoded.id).select('_id favorites');
                if (user) isFavorited = user.favorites?.some((f) => String(f) === String(id)) || false;
            } catch (_e) {
                // ignore invalid token
            }
        }
        res.json({ success: true, meta: { commentsCount, favoritesCount, isFavorited, views: post.views || 0 } });
    } catch (err) {
        return next(err);
    }
}


