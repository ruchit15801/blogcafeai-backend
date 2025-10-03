import { Router } from 'express';
import { forgotPassword, resetPassword, forgotPasswordOtp, resendOtp, verifyOtp, changePassword } from '../controllers/password.controller.js';

const router = Router();

router.post('/forgot', forgotPassword);
router.post('/reset', resetPassword); // now expects { email, otp, newPassword }
router.post('/otp/forgot', forgotPasswordOtp);
router.post('/otp/resend', resendOtp);
router.post('/otp/verify', verifyOtp);
router.post('/otp/change', changePassword);

export default router;


