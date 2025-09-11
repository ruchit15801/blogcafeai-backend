import { Router } from 'express';
import { authMiddleware, requireRole } from '../security/auth.js';
import { listUsers, updateUser, deleteUser, toggleFeatured } from '../controllers/admin.controller.js';

const router = Router();

router.use(authMiddleware, requireRole('admin'));

router.get('/users', listUsers);
router.patch('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);
router.post('/posts/:id/feature', toggleFeatured);

export default router;


