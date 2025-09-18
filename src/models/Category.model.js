import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
    {
        name: { type: String, required: true, unique: true, trim: true },
        slug: { type: String, unique: true, index: true },
        description: { type: String },
        imageUrl: { type: String },
    },
    { timestamps: true }
);

export default mongoose.model('Category', categorySchema);


