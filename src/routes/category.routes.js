import { Router } from 'express';
import { listCategories, adminCreateCategory, adminUpdateCategory, adminDeleteCategory } from '../controllers/category.controller.js';
import { authMiddleware, requireRole } from '../security/auth.js';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/', listCategories);
router.post('/', authMiddleware, requireRole('admin'), upload.single('image'), adminCreateCategory);
router.patch('/:id', authMiddleware, requireRole('admin'), upload.single('image'), adminUpdateCategory);
router.delete('/:id', authMiddleware, requireRole('admin'), adminDeleteCategory);

export default router;


