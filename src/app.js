import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';

import { connectMongo } from './config/mongo.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import authRoutes from './routes/auth.routes.js';
import postRoutes from './routes/post.routes.js';
import categoryRoutes from './routes/category.routes.js';
import tagRoutes from './routes/tag.routes.js';
import homeRoutes from './routes/home.routes.js';
import newsletterRoutes from './routes/newsletter.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import searchRoutes from './routes/search.routes.js';
import adminRoutes from './routes/admin.routes.js';
import userRoutes from './routes/user.routes.js';
import passwordRoutes from './routes/password.routes.js';

const app = express();

// Security & parsing
app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());
app.use(morgan('dev'));

// Rate limiter (basic)
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use('/api/auth', authLimiter);

// Health
const health = (req, res) => {
    return res.status(200).json({
        message: `Blogcafeai Server is Running, Server health is green`,
    });
};

app.get('/', health);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/home', homeRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);
app.use('/api/auth', passwordRoutes);

// 404 and error
app.use(notFoundHandler);
app.use(errorHandler);

// DB connect on import
connectMongo().then(() => {
    console.log('MongoDB connected');
}).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Mongo connection error:', err);
});


export default app;


