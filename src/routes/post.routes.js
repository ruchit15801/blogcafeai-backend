import { Router } from 'express';
import { authMiddleware } from '../security/auth.js';
import {
    listPosts,
    getBySlug,
    createPost,
    updatePost,
    deletePost,
    publishPost,
} from '../controllers/post.controller.js';

const router = Router();

router.get('/', listPosts);
router.get('/:slug', getBySlug);
router.post('/', authMiddleware, createPost);
router.patch('/:id', authMiddleware, updatePost);
router.delete('/:id', authMiddleware, deletePost);
router.post('/:id/publish', authMiddleware, publishPost);

export default router;


