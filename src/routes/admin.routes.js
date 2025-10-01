import { Router } from 'express';
import { authMiddleware, requireRole } from '../security/auth.js';
import multer from 'multer';
import { listUsers, listAllPosts, searchUsersByName, adminCreatePost, adminUpdatePost, adminDeletePost, listScheduledPosts, adminCreateScheduledPost, adminPublishPostNow, updateUser, deleteUser, toggleFeatured, getAdminProfile, updateAdminProfile, fetchPostById } from '../controllers/admin.controller.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.use(authMiddleware, requireRole('admin'));

router.get('/users', listUsers);
router.get('/users/search', searchUsersByName);
router.get('/me/profile', getAdminProfile);
router.patch('/me/profile', upload.single('avatar'), updateAdminProfile);
router.get('/posts', listAllPosts);
router.post('/posts', upload.fields([{ name: 'bannerImage', maxCount: 1 }, { name: 'images', maxCount: 10 }]), adminCreatePost);
router.patch('/posts/:id', upload.fields([{ name: 'bannerImage', maxCount: 1 }, { name: 'images', maxCount: 10 }]), adminUpdatePost);
router.delete('/posts/:id', adminDeletePost);
router.get('/posts/scheduled', listScheduledPosts);
router.post('/posts/scheduled', upload.fields([{ name: 'bannerImage', maxCount: 1 }, { name: 'images', maxCount: 10 }]), adminCreateScheduledPost);
router.post('/posts/:id/publish', adminPublishPostNow);
router.patch('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);
router.post('/posts/:id/feature', toggleFeatured);

router.get('/posts/:id', fetchPostById);

export default router;


