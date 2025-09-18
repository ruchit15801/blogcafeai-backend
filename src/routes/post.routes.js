import { Router } from 'express';
import { authMiddleware } from '../security/auth.js';
import multer from 'multer';
import {
    listPosts,
    getBySlug,
    createPost,
    updatePost,
    deletePost,
    publishPost,
} from '../controllers/post.controller.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

router.get('/', listPosts);
router.get('/:slug', getBySlug);
router.post('/', authMiddleware, upload.fields([{ name: 'bannerImage', maxCount: 1 }, { name: 'images', maxCount: 10 }]), createPost);
router.patch('/:id', authMiddleware, upload.fields([{ name: 'bannerImage', maxCount: 1 }, { name: 'images', maxCount: 10 }]), updatePost);
router.delete('/:id', authMiddleware, deletePost);
router.post('/:id/publish', authMiddleware, publishPost);

export default router;


