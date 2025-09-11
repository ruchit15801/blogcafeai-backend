import BlogPost from '../models/BlogPost.model.js';

export async function home(_req, res, next) {
    try {
        const [featuredPosts, trendingPosts, recentPosts, topAuthors] = await Promise.all([
            BlogPost.find({ status: 'published', isFeatured: true }).sort({ publishedAt: -1 }).limit(6).select('title slug bannerImageUrl summary'),
            BlogPost.find({ status: 'published' }).sort({ trendScore: -1 }).limit(6).select('title slug bannerImageUrl summary'),
            BlogPost.find({ status: 'published' }).sort({ publishedAt: -1 }).limit(6).select('title slug bannerImageUrl summary'),
            BlogPost.aggregate([
                { $match: { status: 'published' } },
                { $group: { _id: '$author', posts: { $sum: 1 } } },
                { $sort: { posts: -1 } },
                { $limit: 5 },
            ]),
        ]);
        res.json({ success: true, featuredPosts, trendingPosts, recentPosts, topAuthors });
    } catch (err) {
        return next(err);
    }
}


