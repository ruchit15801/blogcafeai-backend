import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
    {
        fullName: { type: String, required: true, trim: true },
        email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
        passwordHash: { type: String },
        role: { type: String, enum: ['admin', 'user'], default: 'user', index: true },
        bio: { type: String },
        avatarUrl: { type: String },
        isEmailVerified: { type: Boolean, default: false },
    },
    { timestamps: true }
);

export default mongoose.model('User', userSchema);


