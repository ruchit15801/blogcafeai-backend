import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';

const s3 = new AWS.S3({
    region: process.env.S3_REGION,
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
});

export async function getPresignedUploadUrl({ contentType }) {
    const bucket = process.env.S3_BUCKET;
    const key = `uploads/${uuidv4()}`;
    const params = {
        Bucket: bucket,
        Key: key,
        Expires: 60,
        ContentType: contentType,
        ACL: 'public-read',
    };
    const uploadURL = await s3.getSignedUrlPromise('putObject', params);
    const publicUrl = `https://${bucket}.s3.${process.env.S3_REGION}.amazonaws.com/${key}`;
    return { uploadURL, publicUrl, key };
}

export async function uploadBufferToS3({ buffer, contentType, keyPrefix = 'uploads' }) {
    const bucket = process.env.S3_BUCKET;
    const extensionFromType = (type) => {
        if (!type) return '';
        const map = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp',
            'image/avif': 'avif',
        };
        return map[type] || '';
    };
    const ext = extensionFromType(contentType);
    const key = `${keyPrefix}/${uuidv4()}${ext ? `.${ext}` : ''}`;
    const params = {
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ACL: 'public-read',
        CacheControl: 'public, max-age=31536000, immutable',
    };
    await s3.putObject(params).promise();
    const publicUrl = `https://${bucket}.s3.${process.env.S3_REGION}.amazonaws.com/${key}`;
    return { publicUrl, key };
}


