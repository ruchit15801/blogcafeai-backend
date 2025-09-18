import { Router } from 'express';
import { home, listAllPosts } from '../controllers/home.controller.js';

const router = Router();

router.get('/', home);
router.get('/all-posts', listAllPosts);

export default router;


