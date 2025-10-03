import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import nodemailer from 'nodemailer';
import User from '../models/User.model.js';
import PasswordResetToken from '../models/PasswordResetToken.model.js';

const forgotSchema = z.object({ email: z.string().email() });
// Updated to OTP-based reset to align with new flow
const resetSchema = z.object({ email: z.string().email(), otp: z.string().min(4).max(6), newPassword: z.string().min(6) });

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
        const tokenHash = crypto.createHash('sha256').update(input.otp).digest('hex');
        const record = await PasswordResetToken.findOne({ email: input.email, tokenHash, used: false, expiresAt: { $gt: new Date() } });
        if (!record) return res.status(400).json({ success: false, error: { code: 'INVALID_OTP', message: 'Invalid or expired OTP' } });
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

// ===== OTP FLOW (email OTP with Nodemailer) =====
const emailSchema = z.object({ email: z.string().email() });
const verifySchema = z.object({ email: z.string().email(), otp: z.string().min(4).max(6) });
const changeSchema = z.object({ email: z.string().email(), otp: z.string().min(4).max(6), newPassword: z.string().min(6) });

function generateOtp() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function otpEmailHtml(otp) {
    return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Password Reset OTP</title>
    <style>
      @keyframes glow { 0% { box-shadow: 0 0 8px #7c3aed; } 50% { box-shadow: 0 0 18px #06b6d4; } 100% { box-shadow: 0 0 8px #7c3aed; } }
      .card { max-width: 560px; margin: 24px auto; padding: 28px; border-radius: 16px; background: linear-gradient(135deg, #0f172a, #111827); color: #e5e7eb; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial; border: 1px solid rgba(255,255,255,0.08); animation: glow 2.4s infinite ease-in-out; }
      .title { font-size: 20px; margin: 0 0 8px; color: #fff; }
      .subtitle { margin: 0 0 24px; color: #9ca3af; }
      .otp { display: inline-block; letter-spacing: 6px; background: #0b1220; border: 1px solid #334155; padding: 14px 18px; border-radius: 12px; font-weight: 700; font-size: 28px; color: #fff; }
      .footer { margin-top: 24px; font-size: 12px; color: #94a3b8; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1 class="title">Your password reset code</h1>
      <p class="subtitle">Use the one-time code below. It expires in 10 minutes.</p>
      <div class="otp">${otp}</div>
      <p class="footer">If you did not request this, you can safely ignore this email.</p>
    </div>
  </body>
  </html>`;
}

function createTransport() {
    const { SMTP_SERVICE, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
    const common = { auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined };
    const transporter = SMTP_SERVICE
        ? nodemailer.createTransport({ service: SMTP_SERVICE, ...common })
        : nodemailer.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT ? parseInt(SMTP_PORT, 10) : 587,
            secure: false,
            ...common,
        });
    return { transporter, from: SMTP_FROM || SMTP_USER || 'no-reply@blogcafeai.app' };
}

export async function forgotPasswordOtp(req, res, next) {
    try {
        const { email } = emailSchema.parse(req.body);
        const user = await User.findOne({ email });
        if (!user) return res.json({ success: true });
        const otp = generateOtp();
        const tokenHash = crypto.createHash('sha256').update(otp).digest('hex');
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await PasswordResetToken.create({ email, tokenHash, expiresAt, used: false });

        const { transporter, from } = createTransport();
        const html = otpEmailHtml(otp);
        await transporter.sendMail({ from, to: email, subject: 'Your Password Reset Code', html });

        const payload = { success: true };
        if (process.env.NODE_ENV !== 'production') payload.debugOtp = otp;
        res.json(payload);
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
}

export async function resendOtp(req, res, next) {
    try {
        const { email } = emailSchema.parse(req.body);
        const user = await User.findOne({ email });
        if (!user) return res.json({ success: true });
        const otp = generateOtp();
        const tokenHash = crypto.createHash('sha256').update(otp).digest('hex');
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await PasswordResetToken.create({ email, tokenHash, expiresAt, used: false });

        const { transporter, from } = createTransport();
        const html = otpEmailHtml(otp);
        await transporter.sendMail({ from, to: email, subject: 'Your Password Reset Code (Resent)', html });

        const payload = { success: true };
        if (process.env.NODE_ENV !== 'production') payload.debugOtp = otp;
        res.json(payload);
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
}

export async function verifyOtp(req, res, next) {
    try {
        const { email, otp } = verifySchema.parse(req.body);
        const tokenHash = crypto.createHash('sha256').update(otp).digest('hex');
        const record = await PasswordResetToken.findOne({ email, tokenHash, used: false, expiresAt: { $gt: new Date() } });
        if (!record) return res.status(400).json({ success: false, error: { code: 'INVALID_OTP', message: 'Invalid or expired OTP' } });
        res.json({ success: true, verified: true });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
}

export async function changePassword(req, res, next) {
    try {
        const { email, otp, newPassword } = changeSchema.parse(req.body);
        const tokenHash = crypto.createHash('sha256').update(otp).digest('hex');
        const record = await PasswordResetToken.findOne({ email, tokenHash, used: false, expiresAt: { $gt: new Date() } });
        if (!record) return res.status(400).json({ success: false, error: { code: 'INVALID_OTP', message: 'Invalid or expired OTP' } });
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
        user.passwordHash = await bcrypt.hash(newPassword, 10);
        await user.save();
        record.used = true;
        await record.save();
        res.json({ success: true });
    } catch (err) {
        if (err instanceof z.ZodError) return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: err.flatten() } });
        return next(err);
    }
}


