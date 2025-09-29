import { Router } from 'express';
import { home, listAllPosts, trendingByCategory, topTrendingAuthors, topTrendingCategories } from '../controllers/home.controller.js';

const router = Router();

router.get('/', home);
router.get('/all-posts', listAllPosts);
router.get('/trending-by-category', trendingByCategory);
router.get('/top-trending-authors', topTrendingAuthors);
router.get('/top-trending-categories', topTrendingCategories);

export default router;


