import mongoose from 'mongoose';

const postViewSchema = new mongoose.Schema(
    {
        post: { type: mongoose.Schema.Types.ObjectId, ref: 'BlogPost', required: true, index: true },
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        viewedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

postViewSchema.index({ post: 1, user: 1 }, { unique: true });

export default mongoose.model('PostView', postViewSchema);


