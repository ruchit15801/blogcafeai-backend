import mongoose from 'mongoose';

const autoGenJobSchema = new mongoose.Schema(
    {
        jobDate: { type: Date, required: true, index: true },
        status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending', index: true },
        postId: { type: mongoose.Schema.Types.ObjectId, ref: 'BlogPost' },
        error: { type: String },
    },
    { timestamps: true }
);

export default mongoose.model('AutoGenJob', autoGenJobSchema);


