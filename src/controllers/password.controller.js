import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import User from '../models/User.model.js';
import PasswordResetToken from '../models/PasswordResetToken.model.js';

const forgotSchema = z.object({ email: z.string().email() });
const resetSchema = z.object({ token: z.string().min(20), email: z.string().email(), newPassword: z.string().min(6) });

export async function forgotPassword(req, res, next) {
    try {
        const input = forgotSchema.parse(req.body);
        const user = await User.findOne({ email: input.email });
        if (!user) return res.json({ success: true });
        const tokenPlain = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(tokenPlain).digest('hex');
        const expiresAt = new Date(Date.now() + 1000 * 60 * 30);
        await PasswordResetToken.create({ email: input.email, tokenHash, expiresAt });
        // TODO: send via email provider. For now, return token in dev only
        const payload = { success: true };
        if (process.env.NODE_ENV !== 'production') payload.token = tokenPlain;
        res.json(payload);
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
}

export async function resetPassword(req, res, next) {
    try {
        const input = resetSchema.parse(req.body);
        const tokenHash = crypto.createHash('sha256').update(input.token).digest('hex');
        const record = await PasswordResetToken.findOne({ email: input.email, tokenHash, used: false, expiresAt: { $gt: new Date() } });
        if (!record) return res.status(400).json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' } });
        const user = await User.findOne({ email: input.email });
        if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
        user.passwordHash = await bcrypt.hash(input.newPassword, 10);
        await user.save();
        record.used = true;
        await record.save();
        res.json({ success: true });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
}


