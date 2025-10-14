import nodemailer from 'nodemailer';

export function createTransport() {
    const { SMTP_SERVICE, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
    const common = SMTP_USER && SMTP_PASS ? { auth: { user: SMTP_USER, pass: SMTP_PASS } } : {};
    const transporter = SMTP_SERVICE
        ? nodemailer.createTransport({ service: SMTP_SERVICE, ...common })
        : nodemailer.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT ? parseInt(SMTP_PORT, 10) : 587,
            secure: false,
            ...common,
        });
    const from = SMTP_FROM || SMTP_USER || 'no-reply@blogcafeai.app';
    return { transporter, from };
}

export async function sendEmail({ to, subject, html, text }) {
    const { transporter, from } = createTransport();
    return transporter.sendMail({ from, to, subject, html, text });
}


