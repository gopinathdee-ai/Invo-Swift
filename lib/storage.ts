// lib/storage.ts
// Cloudflare R2 storage. R2 speaks the S3 API, so we use the standard AWS
// SDK v3 clients pointed at R2's endpoint — no Cloudflare-specific SDK
// needed. Uploaded PDFs are private; reads go through a presigned URL,
// same shape as the Supabase/Vercel Blob signed-URL patterns before.

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

const BUCKET = process.env.R2_BUCKET_NAME!;

function getClient() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

export async function uploadInvoicePdf(originalFilename: string, fileBuffer: Buffer): Promise<string> {
  const key = `invoices/${randomUUID()}-${originalFilename}`;
  await getClient().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: "application/pdf",
    })
  );
  return key; // store this in invoices.storage_path
}

export async function getSignedPdfUrl(key: string, expiresInSeconds = 60 * 60): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds });
}

export async function downloadPdfFromStorage(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  const response = await getClient().send(command);
  const chunks: Uint8Array[] = [];
  if (response.Body) {
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
  }
  return Buffer.concat(chunks);
}
