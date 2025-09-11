import { Router } from 'express';
import { signup, login, refresh, me } from '../controllers/auth.controller.js';
import { authMiddleware } from '../security/auth.js';

const router = Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/refresh', refresh);
router.get('/me', authMiddleware, me);

export default router;


