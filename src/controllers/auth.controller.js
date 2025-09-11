import bcrypt from 'bcrypt';
import { z } from 'zod';
import User from '../models/User.model.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../security/auth.js';

const signupSchema = z.object({
    fullName: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
});

export async function signup(req, res, next) {
    try {
        const input = signupSchema.parse(req.body);
        const existing = await User.findOne({ email: input.email });
        if (existing) return res.status(409).json({ success: false, error: { code: 'EMAIL_IN_USE', message: 'Email already registered' } });
        const passwordHash = await bcrypt.hash(input.password, 10);
        const user = await User.create({ fullName: input.fullName, email: input.email, passwordHash });
        const token = signAccessToken({ id: user._id, role: user.role });
        const refreshToken = signRefreshToken({ id: user._id, role: user.role });
        res.status(201).json({ success: true, user: sanitizeUser(user), token, refreshToken });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
}

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function login(req, res, next) {
    try {
        const input = loginSchema.parse(req.body);
        const user = await User.findOne({ email: input.email });
        if (!user) return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' } });
        const ok = await bcrypt.compare(input.password, user.passwordHash || '');
        if (!ok) return res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' } });
        const token = signAccessToken({ id: user._id, role: user.role });
        const refreshToken = signRefreshToken({ id: user._id, role: user.role });
        res.json({ success: true, user: sanitizeUser(user), token, refreshToken });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
}

const refreshSchema = z.object({ refreshToken: z.string().min(10) });

export async function refresh(req, res, next) {
    try {
        const input = refreshSchema.parse(req.body);
        const decoded = verifyRefreshToken(input.refreshToken);
        const user = await User.findById(decoded.id);
        if (!user) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid user' } });
        const token = signAccessToken({ id: user._id, role: user.role });
        const newRefresh = signRefreshToken({ id: user._id, role: user.role });
        res.json({ success: true, token, refreshToken: newRefresh });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
}

export async function me(req, res) {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
    return res.json({ success: true, user: sanitizeUser(user) });
}

function sanitizeUser(user) {
    return { _id: user._id, fullName: user.fullName, email: user.email, role: user.role, avatarUrl: user.avatarUrl, isEmailVerified: user.isEmailVerified };
}


