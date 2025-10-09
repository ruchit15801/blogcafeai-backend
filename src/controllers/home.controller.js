import BlogPost from '../models/BlogPost.model.js';
import Comment from '../models/Comment.model.js';
import User from '../models/User.model.js';
import ContactMessage from '../models/ContactMessage.model.js';
import { z } from 'zod';

export async function home(req, res, next) {
    try {
        const { page = 1, limit = 12, categoryId } = req.query; // added categoryId

        const publishedNowOrUnset = {
            $or: [
                { publishedAt: { $lte: new Date() } },
                { publishedAt: null },
                { publishedAt: { $exists: false } }
            ]
        };

        const publishedMatch = { status: 'published', ...publishedNowOrUnset };

        // ✅ Add category filter if provided
        let recentPostsFilter = { ...publishedMatch };
        if (categoryId) {
            recentPostsFilter.category = categoryId;
        }

        const [
            topViewedPosts,
            topCommentedAgg,
            topLikedAgg,
            topAuthorsAgg,
            recentPosts,
            recentPostsCount
        ] = await Promise.all([
            // 🔥 Top Viewed Blogs
            BlogPost.find(publishedMatch)
                .sort({ views: -1 })
                .limit(6)
                .select('title slug bannerImageUrl summary views readingTimeMinutes tags createdAt publishedAt')
                .populate('author', 'fullName email avatarUrl role twitterUrl facebookUrl instagramUrl linkedinUrl')
                .populate('category', 'name slug'),

            // 🔥 Top Commented Blogs
            Comment.aggregate([
                { $group: { _id: '$post', comments: { $sum: 1 } } },
                { $sort: { comments: -1 } },
                { $limit: 6 },
            ]),

            // 🔥 Top Liked Blogs
            User.aggregate([
                { $unwind: '$likes' },
                { $group: { _id: '$likes', likes: { $sum: 1 } } },
                { $sort: { likes: -1 } },
                { $limit: 6 },
            ]),

            // 🔥 Top Authors
            BlogPost.aggregate([
                { $match: publishedMatch },
                { $group: { _id: '$author', posts: { $sum: 1 } } },
                { $sort: { posts: -1 } },
                { $limit: 5 },
                {
                    $lookup: {
                        from: 'users',
                        localField: '_id',
                        foreignField: '_id',
                        as: 'author'
                    }
                },
                { $unwind: '$author' },
                {
                    $project: {
                        _id: 0,
                        authorId: '$_id',
                        fullName: '$author.fullName',
                        avatarUrl: '$author.avatarUrl',
                        posts: 1
                    }
                }
            ]),

            // 🔥 Recent Blogs (Paginated + Category Filter)
            BlogPost.find(recentPostsFilter)
                .sort({ publishedAt: -1 })
                .skip((page - 1) * limit)
                .limit(parseInt(limit))
                .select('title slug bannerImageUrl summary views readingTimeMinutes tags createdAt publishedAt')
                .populate('author', 'fullName email avatarUrl role twitterUrl facebookUrl instagramUrl linkedinUrl')
                .populate('category', 'name slug'),

            // Count total for pagination
            BlogPost.countDocuments(recentPostsFilter)
        ]);

        // Map commented & liked IDs
        const commentedIds = topCommentedAgg.map(d => d._id).filter(Boolean);
        const likedIds = topLikedAgg.map(d => d._id).filter(Boolean);

        const [commentedPostsRaw, likedPostsRaw] = await Promise.all([
            BlogPost.find({ _id: { $in: commentedIds }, ...publishedMatch })
                .select('title slug bannerImageUrl summary views readingTimeMinutes tags category author')
                .populate('category', 'name slug')
                .populate('author', 'fullName email avatarUrl role twitterUrl facebookUrl instagramUrl linkedinUrl'),
            BlogPost.find({ _id: { $in: likedIds }, ...publishedMatch })
                .select('title slug bannerImageUrl summary views readingTimeMinutes tags category author')
                .populate('category', 'name slug')
                .populate('author', 'fullName email avatarUrl role twitterUrl facebookUrl instagramUrl linkedinUrl'),
        ]);

        // Attach counts
        const commentsByPostId = Object.fromEntries(topCommentedAgg.map(d => [String(d._id), d.comments]));
        const likesByPostId = Object.fromEntries(topLikedAgg.map(d => [String(d._id), d.likes]));

        const topCommentedPosts = commentedPostsRaw
            .map(p => ({ post: p, comments: commentsByPostId[String(p._id)] || 0 }))
            .sort((a, b) => b.comments - a.comments);

        const topLikedPosts = likedPostsRaw
            .map(p => ({ post: p, likes: likesByPostId[String(p._id)] || 0 }))
            .sort((a, b) => b.likes - a.likes);

        res.json({
            success: true,
            topViewedPosts,
            topCommentedPosts,
            topLikedPosts,
            topAuthors: topAuthorsAgg,
            recentPosts: {
                data: recentPosts,
                pagination: {
                    total: recentPostsCount,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(recentPostsCount / limit)
                },
                filter: categoryId ? { categoryId } : null
            }
        });
    } catch (err) {
        return next(err);
    }
}


// GET /api/home/all-posts
// Query: page, limit, category, tag, sort, startDate, endDate, random
export async function listAllPosts(req, res, next) {
    try {
        const page = Math.max(parseInt(req.query.page || '1', 10), 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit || '12', 10), 1), 50);
        const category = req.query.category || undefined;
        const tag = req.query.tag || undefined;
        const sort = req.query.sort || 'latest'; // latest | views | featured | random
        const startDate = req.query.startDate ? new Date(req.query.startDate) : undefined;
        const endDate = req.query.endDate ? new Date(req.query.endDate) : undefined;

        const publishedNowOrUnset = { $or: [{ publishedAt: { $lte: new Date() } }, { publishedAt: null }, { publishedAt: { $exists: false } }] };
        const match = { status: 'published', ...publishedNowOrUnset };
        if (category) match.category = category;
        if (tag) match.tags = tag;
        if (startDate || endDate) {
            match.publishedAt = match.publishedAt || {};
            if (startDate) match.publishedAt.$gte = startDate;
            if (endDate) match.publishedAt.$lte = endDate;
        }

        if (sort === 'random') {
            const pipeline = [
                { $match: match },
                { $sample: { size: limit } },
                { $project: { title: 1, slug: 1, bannerImageUrl: 1, summary: 1, publishedAt: 1, views: 1, category: 1, author: 1, readingTimeMinutes: 1, tags: 1, createdAt: 1 } },
            ];
            let data = await BlogPost.aggregate(pipeline);
            // Populate category after aggregate
            data = await BlogPost.populate(data, [
                { path: 'category', select: 'name slug' },
                { path: 'author', select: 'fullName email avatarUrl role twitterUrl facebookUrl instagramUrl linkedinUrl' },
            ]);
            // total count for pagination (approximate when random)
            const total = await BlogPost.countDocuments(match);
            return res.json({ success: true, data, meta: { page, limit, total, random: true } });
        }

        let sortObj = { publishedAt: -1 };
        if (sort === 'views') sortObj = { views: -1, publishedAt: -1 };
        if (sort === 'featured') sortObj = { isFeatured: -1, publishedAt: -1 };

        const [data, total] = await Promise.all([
            BlogPost.find(match)
                .sort(sortObj)
                .skip((page - 1) * limit)
                .limit(limit)
                .select('title slug bannerImageUrl tags readingTimeMinutes summary publishedAt views author category createdAt')
                .populate('category', 'name slug')
                .populate('author', 'fullName email avatarUrl role twitterUrl facebookUrl instagramUrl linkedinUrl'),
            BlogPost.countDocuments(match),
        ]);
        return res.json({ success: true, data, meta: { page, limit, total } });
    } catch (err) {
        return next(err);
    }
}


// GET /api/home/trending-by-category
// Query: categoriesLimit (default 9), postsPerCategory (default 5)
export async function trendingByCategory(req, res, next) {
    try {
        const categoriesLimit = Math.min(Math.max(parseInt(req.query.categoriesLimit || '9', 10), 1), 20);

        const pipeline = [
            {
                $match: {
                    status: 'published',
                    category: { $exists: true, $ne: null }, // ✅ avoid null & undefined categories
                    $or: [
                        { publishedAt: { $lte: new Date() } },
                        { publishedAt: null },
                        { publishedAt: { $exists: false } }
                    ]
                }
            },
            {
                $group: {
                    _id: '$category',
                    totalViews: { $sum: '$views' },
                    postCount: { $sum: 1 } // ✅ count total posts
                }
            },
            { $sort: { totalViews: -1 } },
            { $limit: categoriesLimit },
            {
                $project: {
                    _id: 0,
                    category: '$_id',
                    totalViews: 1,
                    postCount: 1
                }
            }
        ];

        let data = await BlogPost.aggregate(pipeline);

        // ✅ populate category name, slug & imageUrl
        data = await BlogPost.populate(data, {
            path: 'category',
            select: 'name slug imageUrl'
        });

        // ✅ filter categories with missing/null name
        data = data.filter(c => c.category && c.category.name);

        return res.json({
            success: true,
            data,
            meta: { categoriesLimit }
        });
    } catch (err) {
        return next(err);
    }
}



// GET /api/home/top-trending-authors
// Query: limit (default 5)
export async function topTrendingAuthors(req, res, next) {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit || '5', 10), 1), 20);
        const publishedNowOrUnset = { $or: [{ publishedAt: { $lte: new Date() } }, { publishedAt: null }, { publishedAt: { $exists: false } }] };
        const pipeline = [
            { $match: { status: 'published', ...publishedNowOrUnset } },
            { $group: { _id: '$author', totalViews: { $sum: '$views' }, totalPosts: { $sum: 1 } } },
            // Join with users to filter out admins
            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'author' } },
            { $unwind: '$author' },
            { $match: {} },
            { $sort: { totalViews: -1 } },
            { $limit: limit },
            { $project: { _id: 0, author: { _id: '$author._id', fullName: '$author.fullName', email: '$author.email', avatarUrl: '$author.avatarUrl', role: '$author.role', createdAt: '$author.createdAt' }, totalViews: 1, totalPosts: 1 } },
        ];
        const authors = await BlogPost.aggregate(pipeline);
        return res.json({ success: true, data: authors, meta: { limit } });
    } catch (err) {
        return next(err);
    }
}

// GET /api/home/top-trending-categories
// Query: limit (default 9)
export async function topTrendingCategories(req, res, next) {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit || '9', 10), 1), 50);

        const publishedNowOrUnset = {
            $or: [
                { publishedAt: { $lte: new Date() } },
                { publishedAt: null },
                { publishedAt: { $exists: false } }
            ]
        };

        const pipeline = [
            { $match: { status: 'published', category: { $ne: null }, ...publishedNowOrUnset } }, // 🚀 skip null categories
            { $group: { _id: '$category', totalViews: { $sum: '$views' }, totalPosts: { $sum: 1 } } },
            { $sort: { totalViews: -1 } },
            { $limit: limit },
        ];

        let data = await BlogPost.aggregate(pipeline);
        data = await BlogPost.populate(data, { path: '_id', model: 'Category', select: 'name slug' });

        const categories = data.map(d => ({
            category: d._id,
            totalViews: d.totalViews || 0,
            totalPosts: d.totalPosts || 0
        }));

        return res.json({ success: true, data: categories, meta: { limit } });
    } catch (err) {
        return next(err);
    }
}

// Public: submit contact message
const contactSchema = z.object({ name: z.string().min(2), email: z.string().email(), message: z.string().min(5).max(2000) });
export async function submitContactMessage(req, res, next) {
    try {
        const input = contactSchema.parse(req.body);
        const doc = await ContactMessage.create({ name: input.name, email: input.email, message: input.message });
        res.status(201).json({ success: true, messageId: doc._id });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
}


