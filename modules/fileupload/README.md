# fileupload

Direct-to-S3 file uploads with asynchronous Lambda processing. Users upload files directly from the browser to S3 (bypassing Django), and a Lambda function handles post-processing (e.g. image resizing / thumbnail generation) and writes results to a second bucket.

## How it works

```
Browser → presign request → Django → S3 presigned PUT URL
Browser → PUT file directly → S3 upload bucket
Browser → confirm upload → Django (status: processing)
S3 upload bucket → triggers → Lambda
Lambda → resized image → S3 processed bucket
Lambda → POST webhook → Django (status: complete / failed)
```

## Environment variables

Add these to your `.env`:

```env
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_REGION=us-east-1
AWS_UPLOAD_BUCKET=your-app-uploads
AWS_PROCESSED_BUCKET=your-app-processed
FILEUPLOAD_WEBHOOK_SECRET=a-long-random-secret
```

`FILEUPLOAD_WEBHOOK_SECRET` is sent by Lambda in the `Authorization: Bearer <secret>` header. Generate with:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

## AWS setup

### 1. Create two S3 buckets

| Bucket | Purpose |
|--------|---------|
| `your-app-uploads` | Raw files uploaded directly by the browser |
| `your-app-processed` | Resized / processed output written by Lambda |

Both buckets should block all public access. Files are served via presigned URLs.

**CORS on the upload bucket** — required so the browser can PUT directly:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT"],
    "AllowedOrigins": ["https://your-domain.com"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

### 2. IAM user for Django

Create an IAM user (or role) for the Django app with this policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PresignUpload",
      "Effect": "Allow",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::your-app-uploads/*"
    },
    {
      "Sid": "PresignSourceRead",
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::your-app-uploads/*"
    },
    {
      "Sid": "PresignProcessedRead",
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::your-app-processed/*"
    }
  ]
}
```

These permissions are only used to generate presigned URLs — no data passes through Django.

### 3. IAM role for Lambda

Create an execution role for the Lambda function with this policy (in addition to the standard `AWSLambdaBasicExecutionRole`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadSource",
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::your-app-uploads/*"
    },
    {
      "Sid": "WriteProcessed",
      "Effect": "Allow",
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::your-app-processed/*"
    }
  ]
}
```

## Lambda function

### Setup

1. Create a Lambda function (Python 3.12 runtime).
2. Assign the IAM role from step 3 above.
3. Add a **S3 trigger**: source bucket `your-app-uploads`, event type `PUT`.
4. Set these environment variables on the Lambda:

| Variable | Value |
|----------|-------|
| `PROCESSED_BUCKET` | `your-app-processed` |
| `WEBHOOK_URL` | `https://your-domain.com/api/fileupload/webhook/` |
| `WEBHOOK_SECRET` | same value as `FILEUPLOAD_WEBHOOK_SECRET` in Django |
| `MAX_WIDTH` | `1280` (or your target max width) |
| `THUMBNAIL_WIDTH` | `256` (optional, for a small thumb) |

### Code

```python
import os
import io
import json
import urllib.request

import boto3
from PIL import Image

s3               = boto3.client('s3')
PROCESSED_BUCKET = os.environ['PROCESSED_BUCKET']
WEBHOOK_URL      = os.environ['WEBHOOK_URL']
WEBHOOK_SECRET   = os.environ['WEBHOOK_SECRET']
MAX_WIDTH        = int(os.environ.get('MAX_WIDTH', 1280))
THUMBNAIL_WIDTH  = int(os.environ.get('THUMBNAIL_WIDTH', 256))

IMAGE_TYPES = {'image/jpeg', 'image/png', 'image/webp', 'image/gif'}


def _post_webhook(file_id: str, status: str, error: str = '') -> None:
    payload = json.dumps({'file_id': file_id, 'status': status, 'error': error}).encode()
    req = urllib.request.Request(
        WEBHOOK_URL,
        data=payload,
        headers={
            'Content-Type':  'application/json',
            'Authorization': f'Bearer {WEBHOOK_SECRET}',
        },
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        resp.read()


def _resize(img: Image.Image, max_px: int) -> Image.Image:
    w, h = img.size
    if w <= max_px:
        return img
    ratio   = max_px / w
    new_size = (max_px, int(h * ratio))
    return img.resize(new_size, Image.LANCZOS)


def lambda_handler(event, context):
    record     = event['Records'][0]
    src_bucket = record['s3']['bucket']['name']
    key        = record['s3']['object']['key']

    # S3 key is  <user_id>/<file_uuid>  — the UUID is the Django file_id
    file_id = key.split('/')[-1]

    try:
        obj          = s3.get_object(Bucket=src_bucket, Key=key)
        content_type = obj['ContentType']
        body         = obj['Body'].read()

        if content_type not in IMAGE_TYPES:
            # Non-image: copy as-is and mark complete
            s3.put_object(
                Bucket=PROCESSED_BUCKET,
                Key=key,
                Body=body,
                ContentType=content_type,
            )
            _post_webhook(file_id, 'complete')
            return

        img = Image.open(io.BytesIO(body))
        if img.mode not in ('RGB', 'RGBA'):
            img = img.convert('RGB')

        # Full-size, capped at MAX_WIDTH
        resized     = _resize(img, MAX_WIDTH)
        buf         = io.BytesIO()
        save_format = 'JPEG' if content_type == 'image/jpeg' else 'WEBP'
        resized.save(buf, format=save_format, quality=85, optimize=True)
        buf.seek(0)
        s3.put_object(
            Bucket=PROCESSED_BUCKET,
            Key=key,
            Body=buf,
            ContentType=content_type,
        )

        # Thumbnail
        thumb       = _resize(img, THUMBNAIL_WIDTH)
        thumb_buf   = io.BytesIO()
        thumb.save(thumb_buf, format=save_format, quality=75, optimize=True)
        thumb_buf.seek(0)
        s3.put_object(
            Bucket=PROCESSED_BUCKET,
            Key=f'thumbs/{key}',
            Body=thumb_buf,
            ContentType=content_type,
        )

        _post_webhook(file_id, 'complete')

    except Exception as exc:
        print(f'ERROR processing {key}: {exc}')
        _post_webhook(file_id, 'failed', error=str(exc))
        raise


```

### Adding Pillow as a dependency

Pillow is not included in the Lambda runtime. Options:

**Option A — Lambda layer (recommended)**

```bash
pip install pillow --platform manylinux2014_x86_64 --target python/ --only-binary=:all:
zip -r pillow-layer.zip python/
aws lambda publish-layer-version \
  --layer-name pillow \
  --zip-file fileb://pillow-layer.zip \
  --compatible-runtimes python3.12
```

Then attach the layer to your Lambda function.

**Option B — Docker image**

Build a container image with Pillow included and deploy it to Lambda.

## API endpoints

All routes are under `/api/fileupload/`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `presign/` | Required | Returns a presigned S3 PUT URL |
| `POST` | `confirm/<file_id>/` | Required | Marks file as processing |
| `GET`  | `files/` | Required | Lists the user's uploaded files |
| `GET`  | `files/<file_id>/url/` | Required | Returns presigned GET URLs |
| `POST` | `webhook/` | Bearer token | Called by Lambda on completion |

### Presign request body

```json
{ "filename": "photo.jpg", "content_type": "image/jpeg", "size": 204800 }
```

### Webhook request body (sent by Lambda)

```json
{ "file_id": "<uuid>", "status": "complete" }
{ "file_id": "<uuid>", "status": "failed", "error": "reason" }
```

## Django signals

Listen to these in any other module to react to file events:

```python
from fileupload.signals import file_uploaded, file_processed

def on_upload(sender, file, **kwargs):
    # file.status == 'processing'
    pass

def on_processed(sender, file, **kwargs):
    # file.status == 'complete' or 'failed'
    pass

file_uploaded.connect(on_upload)
file_processed.connect(on_processed)
```

## File status lifecycle

```
pending → processing → complete
                     ↘ failed
```

## Frontend routes

| Path | Component |
|------|-----------|
| `/files` | List of the user's uploaded files |
| `/files/upload` | Drag-and-drop upload page |

## Installation

```bash
python install.py add fileupload
python core/backend/manage.py migrate
```
