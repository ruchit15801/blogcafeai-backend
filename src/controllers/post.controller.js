import { z } from 'zod';
import slugify from 'slugify';
import sanitizeHtml from 'sanitize-html';
import BlogPost from '../models/BlogPost.model.js';
import { computeReadTimeMinutesFromHtml } from '../utils/readtime.js';

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
        const filter = { status: 'published' };
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
        const post = await BlogPost.findOneAndUpdate({ slug }, { $inc: { views: 1 } }, { new: true })
            .populate('author', 'fullName')
            .populate('category', 'name slug')
            .populate('tags', 'name slug');
        if (!post) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Post not found' } });
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
    status: z.enum(['draft', 'published']).default('draft'),
    publishedAt: z.string().optional(),
});

export async function createPost(req, res, next) {
    try {
        const input = createSchema.parse(req.body);
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
        const input = updateSchema.parse(req.body);
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


