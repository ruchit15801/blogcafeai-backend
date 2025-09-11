import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import app from './app.js';

const PORT = process.env.PORT || 4000;

const server = http.createServer(app);

server.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`BlogCafeAI backend running on port ${PORT}`);
});

export default server;


