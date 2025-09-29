import { Router } from 'express';
import { home, listAllPosts, trendingByCategory } from '../controllers/home.controller.js';

const router = Router();

router.get('/', home);
router.get('/all-posts', listAllPosts);
router.get('/trending-by-category', trendingByCategory);

export default router;


