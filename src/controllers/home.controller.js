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

        const match = { status: 'published', publishedAt: { $lte: new Date() } };
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
                { $project: { title: 1, slug: 1, bannerImageUrl: 1, summary: 1, publishedAt: 1, views: 1, category: 1 } },
            ];
            let data = await BlogPost.aggregate(pipeline);
            // Populate category after aggregate
            data = await BlogPost.populate(data, { path: 'category', select: 'name slug' });
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
                .select('title slug bannerImageUrl summary publishedAt views')
                .populate('category', 'name slug'),
            BlogPost.countDocuments(match),
        ]);
        return res.json({ success: true, data, meta: { page, limit, total } });
    } catch (err) {
        return next(err);
    }
}


