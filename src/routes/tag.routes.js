import { Router } from 'express';
import { listTags, adminCreateTag, adminUpdateTag, adminDeleteTag } from '../controllers/tag.controller.js';
import { authMiddleware, requireRole } from '../security/auth.js';

const router = Router();

router.get('/', listTags);
router.post('/', authMiddleware, requireRole('admin'), adminCreateTag);
router.patch('/:id', authMiddleware, requireRole('admin'), adminUpdateTag);
router.delete('/:id', authMiddleware, requireRole('admin'), adminDeleteTag);

export default router;


