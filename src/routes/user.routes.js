import { Router } from 'express';
import { listUserPosts, getMyProfile, updateMyProfile, userDashboard } from '../controllers/user.controller.js';
import { authMiddleware } from '../security/auth.js';
import multer from 'multer';
import { z } from 'zod';
import User from '../models/User.model.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/posts',authMiddleware, listUserPosts);
router.get('/me/profile', authMiddleware, getMyProfile);
router.patch('/me/profile', authMiddleware, upload.single('avatar'), updateMyProfile);
router.get('/me/dashboard', authMiddleware, userDashboard);

// Favorites endpoints
const favSchema = z.object({ postId: z.string().min(1) });

router.post('/me/favorites', authMiddleware, async (req, res, next) => {
    try {
        const { postId } = favSchema.parse(req.body);
        await User.updateOne({ _id: req.user.id }, { $addToSet: { favorites: postId } });
        res.json({ success: true });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
});

router.delete('/me/favorites/:postId', authMiddleware, async (req, res, next) => {
    try {
        const { postId } = req.params;
        await User.updateOne({ _id: req.user.id }, { $pull: { favorites: postId } });
        res.json({ success: true });
    } catch (err) {
        return next(err);
    }
});

router.get('/me/favorites', authMiddleware, async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id).populate({ path: 'favorites', select: 'title slug bannerImageUrl publishedAt' });
        res.json({ success: true, data: user?.favorites || [] });
    } catch (err) {
        return next(err);
    }
});

export default router;


