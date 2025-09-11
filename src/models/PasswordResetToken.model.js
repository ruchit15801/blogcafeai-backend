import mongoose from 'mongoose';

const schema = new mongoose.Schema(
    {
        email: { type: String, required: true, index: true },
        tokenHash: { type: String, required: true },
        expiresAt: { type: Date, required: true, index: true },
        used: { type: Boolean, default: false },
    },
    { timestamps: true }
);

export default mongoose.model('PasswordResetToken', schema);


