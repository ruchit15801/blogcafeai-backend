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

function otpEmailHtml(userName, otp) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Password Reset OTP</title>
</head>
<body style="margin:0; padding:0; font-family: Arial, sans-serif; background-color:#f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6; padding: 30px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#fff; border-radius:16px; padding:32px; box-shadow:0 8px 24px rgba(0,0,0,0.1); border:1px solid rgba(0,0,0,0.05);">
          <!-- Logo -->
          <tr>
            <td align="center" style="font-weight:700; font-size:28px; color:#4f46e5; margin-bottom:24px; padding-bottom:16px;">
              BlogCafeAi
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="font-size:16px; color:#111827; padding-bottom:12px;">
              Dear ${userName},
            </td>
          </tr>

          <!-- Intro -->
          <tr>
            <td style="font-size:15px; color:#4b5563; line-height:1.6; padding-bottom:24px;">
              We received a request to reset your password. Please use the One-Time Password (OTP) below to verify your request:
            </td>
          </tr>

          <!-- OTP Box -->
          <tr>
            <td align="center" style="background-color:#e0e7ff; padding:20px 0; border-radius:12px; font-size:32px; font-weight:700; letter-spacing:8px; color:#1e3a8a; border:1px solid #c7d2fe; box-shadow:0 4px 8px rgba(79,70,229,0.2); margin-bottom:16px;">
              ${otp}
            </td>
          </tr>

          <!-- OTP Note -->
          <tr>
            <td align="center" style="font-size:14px; color:#6b7280; padding:24px 0px;">
              This OTP is valid for the next 10 minutes.
            </td>
          </tr>

          <!-- Ignore note -->
          <tr>
            <td style="font-size:14px; color:#4b5563; line-height:1.5; padding-bottom:24px;">
              If you did not request a password reset, you can safely ignore this email.
            </td>
          </tr>

          <!-- Regards -->
          <tr>
            <td align="center" style="font-weight:600; color:#111827; padding-bottom:4px;">Regards,</td>
          </tr>
          <tr>
            <td align="center" style="font-weight:700; color:#4f46e5; padding-bottom:24px;">Team BlogCafeAi</td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="font-size:13px; color:#6b7280;">
              © 2025 BlogCafeAi. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
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
        const html = otpEmailHtml(user.fullName || user.name || user.email, otp);
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
        const html = otpEmailHtml(user.fullName || user.name || user.email, otp);
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
