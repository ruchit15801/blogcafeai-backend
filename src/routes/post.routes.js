import { Router } from 'express';
import { authMiddleware } from '../security/auth.js';
import multer from 'multer';
import { Router as _Router } from 'express';
import Comment from '../models/Comment.model.js';
import { z } from 'zod';
import {
    listPosts,
    getBySlug,
    createPost,
    updatePost,
    deletePost,
    publishPost,
    getPostMeta,
    listScheduledPosts,
    userCreateScheduledPost,
} from '../controllers/post.controller.js';
import { fetchPostById } from '../controllers/admin.controller.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
router.get('/:id', fetchPostById);
router.get('/', listPosts);
router.get('/:slug', getBySlug);
router.post('/', authMiddleware, upload.fields([{ name: 'bannerImage', maxCount: 1 }, { name: 'images', maxCount: 10 }]), createPost);
router.patch('/:id', authMiddleware, upload.fields([{ name: 'bannerImage', maxCount: 1 }, { name: 'images', maxCount: 10 }]), updatePost);
router.delete('/:id', authMiddleware, deletePost);
router.get('/scheduled', listScheduledPosts);
router.post('/scheduled', authMiddleware, upload.fields([{ name: 'bannerImage', maxCount: 1 }, { name: 'images', maxCount: 10 }]), userCreateScheduledPost);
router.post('/:id/publish', authMiddleware, publishPost);
router.get('/:id/meta', getPostMeta);


// Comments
const commentSchema = z.object({ content: z.string().min(1).max(2000) });
router.get('/:id/comments', async (req, res, next) => {
    try {
        const { id } = req.params;
        const comments = await Comment.find({ post: id })
            .sort({ createdAt: -1 })
            .limit(100)
            .populate('author', 'fullName avatarUrl');
        res.json({ success: true, data: comments });
    } catch (err) {
        return next(err);
    }
});

router.post('/:id/comments', authMiddleware, async (req, res, next) => {
    try {
        const { id } = req.params;
        const input = commentSchema.parse(req.body);
        const created = await Comment.create({ post: id, author: req.user.id, content: input.content });
        res.status(201).json({ success: true, comment: await created.populate('author', 'fullName avatarUrl') });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
});

router.delete('/:postId/comments/:commentId', authMiddleware, async (req, res, next) => {
    try {
        const { postId, commentId } = req.params;
        const comment = await Comment.findById(commentId);
        if (!comment || String(comment.post) !== postId) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Comment not found' } });
        if (String(comment.author) !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Cannot delete' } });
        await comment.deleteOne();
        res.json({ success: true });
    } catch (err) {
        return next(err);
    }
});

export default router;


