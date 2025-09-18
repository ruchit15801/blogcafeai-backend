import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import app from './app.js';
import { startPublisherCron } from './jobs/publisher.js';

const PORT = process.env.PORT || 4000;

const server = http.createServer(app);

server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`BlogCafeAI backend running on port ${PORT}`);
    // Start background publisher cron (every 1 minute)
    startPublisherCron();
});

export default server;


