import { Router } from 'express';
import { listUserPosts } from '../controllers/user.controller.js';

const router = Router();

router.get('/:userId/posts', listUserPosts);

export default router;


