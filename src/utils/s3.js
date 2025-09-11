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


