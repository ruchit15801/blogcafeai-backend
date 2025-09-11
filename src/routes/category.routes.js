import { Router } from 'express';
import { listCategories, adminCreateCategory, adminUpdateCategory, adminDeleteCategory } from '../controllers/category.controller.js';
import { authMiddleware, requireRole } from '../security/auth.js';

const router = Router();

router.get('/', listCategories);
router.post('/', authMiddleware, requireRole('admin'), adminCreateCategory);
router.patch('/:id', authMiddleware, requireRole('admin'), adminUpdateCategory);
router.delete('/:id', authMiddleware, requireRole('admin'), adminDeleteCategory);

export default router;


