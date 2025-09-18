import BlogPost from '../models/BlogPost.model.js';

export async function home(_req, res, next) {
    try {
        const [featuredPosts, trendingPosts, recentPosts, topAuthors] = await Promise.all([
            BlogPost.find({ status: 'published', publishedAt: { $lte: new Date() }, isFeatured: true })
                .sort({ publishedAt: -1 })
                .limit(6)
                .select('title slug bannerImageUrl summary views')
                .populate('category', 'name slug'),
            BlogPost.find({ status: 'published', publishedAt: { $lte: new Date() } })
                .sort({ views: -1, publishedAt: -1 })
                .limit(6)
                .select('title slug bannerImageUrl summary views')
                .populate('category', 'name slug'),
            BlogPost.find({ status: 'published', publishedAt: { $lte: new Date() } })
                .sort({ publishedAt: -1 })
                .limit(6)
                .select('title slug bannerImageUrl summary views')
                .populate('category', 'name slug'),
            BlogPost.aggregate([
                { $match: { status: 'published', publishedAt: { $lte: new Date() } } },
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


