import express from 'express';
import PostModel from './models/post.model.js'; // post model import karna zaruri

const publicRouter = express.Router();

publicRouter.get("/:id", async (req, res) => {
    try {
        const post = await PostModel.findById(req.params.id);
        if (!post) 
            return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Post not found" } });
        
        res.json({ success: true, post });
    } catch (err) {
        res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: String(err) } });
    }
});
