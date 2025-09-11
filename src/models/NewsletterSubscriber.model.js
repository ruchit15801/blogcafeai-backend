import mongoose from 'mongoose';

const newsletterSubscriberSchema = new mongoose.Schema(
    {
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        name: { type: String },
        isVerified: { type: Boolean, default: false },
        subscribedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

export default mongoose.model('NewsletterSubscriber', newsletterSubscriberSchema);


