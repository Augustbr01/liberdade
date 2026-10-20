import { S3Client } from "@aws-sdk/client-s3";

const {R2_ACESS_KEY,R2_SECRET_ACESS_KEY,R2_URL,R2_ACCOUNT_ID} = process.env;

if(!R2_ACESS_KEY || !R2_SECRET_ACESS_KEY || ! R2_URL || !R2_ACCOUNT_ID) {
    throw new Error("faltando .env")
}

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACESS_KEY,
    secretAccessKey: R2_SECRET_ACESS_KEY,
  },
});

export {r2};
