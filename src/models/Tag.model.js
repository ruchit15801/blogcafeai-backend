import mongoose from 'mongoose';

const tagSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, unique: true, trim: true },
        slug: { type: String, unique: true, index: true },
    },
    { timestamps: true }
);

export default mongoose.model('Tag', tagSchema);


