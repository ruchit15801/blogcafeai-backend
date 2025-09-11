import { Router } from 'express';
import { subscribe } from '../controllers/newsletter.controller.js';

const router = Router();

router.post('/subscribe', subscribe);

export default router;


