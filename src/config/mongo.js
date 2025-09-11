import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

export async function connectMongo() {
    const mongoUri = process.env.MONGODB_URI;
    mongoose.set('strictQuery', true);
    await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 10000,
    });
}


