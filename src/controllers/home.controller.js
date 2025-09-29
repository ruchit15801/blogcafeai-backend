import BlogPost from '../models/BlogPost.model.js';
import Comment from '../models/Comment.model.js';
import User from '../models/User.model.js';

export async function home(_req, res, next) {
    try {
        const publishedNowOrUnset = { $or: [{ publishedAt: { $lte: new Date() } }, { publishedAt: null }, { publishedAt: { $exists: false } }] };
        const publishedMatch = { status: 'published', ...publishedNowOrUnset };
        const [featuredPosts, trendingPosts, recentPosts, topAuthors, discussedAgg, favoritedAgg] = await Promise.all([
            BlogPost.find({ ...publishedMatch, isFeatured: true })
                .sort({ publishedAt: -1 })
                .limit(6)
                .select('title slug bannerImageUrl summary views readingTimeMinutes tags')
                .populate('author', 'fullName email avatarUrl role')
                .populate('category', 'name slug'),
            BlogPost.find(publishedMatch)
                .sort({ views: -1, publishedAt: -1 })
                .limit(6)
                .select('title slug bannerImageUrl summary views readingTimeMinutes tags')
                .populate('author', 'fullName email avatarUrl role')
                .populate('category', 'name slug'),
            BlogPost.find(publishedMatch)
                .sort({ publishedAt: -1 })
                .limit(6)
                .select('title slug bannerImageUrl summary views readingTimeMinutes tags')
                .populate('author', 'fullName email avatarUrl role')
                .populate('category', 'name slug'),
            BlogPost.aggregate([
                { $match: publishedMatch },
                { $group: { _id: '$author', posts: { $sum: 1 } } },
                { $sort: { posts: -1 } },
                { $limit: 5 },
            ]),
            Comment.aggregate([
                { $group: { _id: '$post', comments: { $sum: 1 } } },
                { $sort: { comments: -1 } },
                { $limit: 6 },
            ]),
            User.aggregate([
                { $unwind: '$favorites' },
                { $group: { _id: '$favorites', favorites: { $sum: 1 } } },
                { $sort: { favorites: -1 } },
                { $limit: 6 },
            ]),
        ]);
        const discussedIds = discussedAgg.map((d) => d._id).filter(Boolean);
        const favoritedIds = favoritedAgg.map((d) => d._id).filter(Boolean);

        const [discussedPostsRaw, favoritedPostsRaw] = await Promise.all([
            BlogPost.find({ _id: { $in: discussedIds }, ...publishedMatch })
                .select('title slug bannerImageUrl summary views readingTimeMinutes tags category author')
                .populate('category', 'name slug')
                .populate('author', 'fullName email avatarUrl role'),
            BlogPost.find({ _id: { $in: favoritedIds }, ...publishedMatch })
                .select('title slug bannerImageUrl summary views readingTimeMinutes tags category author')
                .populate('category', 'name slug')
                .populate('author', 'fullName email avatarUrl role'),
        ]);

        const commentsByPostId = Object.fromEntries(discussedAgg.map((d) => [String(d._id), d.comments]));
        const favoritesByPostId = Object.fromEntries(favoritedAgg.map((d) => [String(d._id), d.favorites]));

        const mostDiscussedPosts = discussedPostsRaw
            .map((p) => ({ post: p, comments: commentsByPostId[String(p._id)] || 0 }))
            .sort((a, b) => b.comments - a.comments);
        const mostFavoritedPosts = favoritedPostsRaw
            .map((p) => ({ post: p, favorites: favoritesByPostId[String(p._id)] || 0 }))
            .sort((a, b) => b.favorites - a.favorites);

        res.json({ success: true, featuredPosts, trendingPosts, recentPosts, topAuthors, mostDiscussedPosts, mostFavoritedPosts });
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
                { $project: { title: 1, slug: 1, bannerImageUrl: 1, summary: 1, publishedAt: 1, views: 1, category: 1, author: 1, readingTimeMinutes: 1, tags: 1 } },
            ];
            let data = await BlogPost.aggregate(pipeline);
            // Populate category after aggregate
            data = await BlogPost.populate(data, [
                { path: 'category', select: 'name slug' },
                { path: 'author', select: 'fullName email avatarUrl role' },
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
                .select('title slug bannerImageUrl tags readingTimeMinutes summary publishedAt views author category')
                .populate('category', 'name slug')
                .populate('author', 'fullName email avatarUrl role'),
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
        const postsPerCategory = Math.min(Math.max(parseInt(req.query.postsPerCategory || '5', 10), 1), 20);

        const pipeline = [
            { $match: { status: 'published', $or: [{ publishedAt: { $lte: new Date() } }, { publishedAt: null }, { publishedAt: { $exists: false } }] } },
            { $sort: { views: -1, publishedAt: -1 } },
            {
                $group: {
                    _id: '$category',
                    totalViews: { $sum: '$views' },
                    posts: {
                        $push: {
                            _id: '$_id',
                            title: '$title',
                            slug: '$slug',
                            bannerImageUrl: '$bannerImageUrl',
                            summary: '$summary',
                            views: '$views',
                            publishedAt: '$publishedAt',
                            category: '$category',
                        },
                    },
                },
            },
            { $sort: { totalViews: -1 } },
            { $limit: categoriesLimit },
            { $project: { _id: 0, category: '$_id', totalViews: 1, posts: { $slice: ['$posts', postsPerCategory] } } },
        ];

        let data = await BlogPost.aggregate(pipeline);
        data = await BlogPost.populate(data, { path: 'category', select: 'name slug' });

        return res.json({ success: true, data, meta: { categoriesLimit, postsPerCategory } });
    } catch (err) {
        return next(err);
    }
}

