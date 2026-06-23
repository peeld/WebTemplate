import logging

import boto3
from botocore.exceptions import ClientError
from django.conf import settings
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import UploadedFile
from .serializers import PresignRequestSerializer, UploadedFileSerializer, WebhookSerializer
from .signals import file_processed, file_uploaded

logger = logging.getLogger(__name__)

PRESIGN_EXPIRES = 300  # seconds


def _s3_client():
    return boto3.client(
        's3',
        region_name=getattr(settings, 'AWS_S3_REGION', 'us-east-1'),
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
    )


class PresignView(APIView):
    """Create a DB record and return a presigned PUT URL for direct S3 upload."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = PresignRequestSerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=400)

        data = ser.validated_data
        upload_file = UploadedFile.objects.create(
            user=request.user,
            original_filename=data['filename'],
            content_type=data['content_type'],
            size=data.get('size'),
        )

        s3  = _s3_client()
        key = upload_file.s3_key
        try:
            upload_url = s3.generate_presigned_url(
                'put_object',
                Params={
                    'Bucket':      settings.AWS_UPLOAD_BUCKET,
                    'Key':         key,
                    'ContentType': data['content_type'],
                },
                ExpiresIn=PRESIGN_EXPIRES,
            )
        except ClientError as e:
            logger.error('Failed to generate presigned URL for file %s: %s', upload_file.id, e)
            upload_file.delete()
            return Response({'error': 'Unable to generate upload URL.'}, status=502)

        logger.info('Presigned URL generated for file %s (user %s)', upload_file.id, request.user.pk)
        return Response({'file_id': str(upload_file.id), 'upload_url': upload_url, 'key': key})


class ConfirmView(APIView):
    """Mark a file as processing after the client completes the S3 upload."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            upload_file = UploadedFile.objects.get(pk=pk, user=request.user)
        except UploadedFile.DoesNotExist:
            return Response({'error': 'Not found.'}, status=404)

        if upload_file.status != UploadedFile.Status.PENDING:
            return Response({'error': 'File is not in pending state.'}, status=400)

        upload_file.status = UploadedFile.Status.PROCESSING
        upload_file.save(update_fields=['status', 'updated_at'])

        file_uploaded.send(sender=self.__class__, file=upload_file)
        logger.info('File %s confirmed uploaded by user %s', upload_file.id, request.user.pk)
        return Response({'status': upload_file.status})


class FileListView(APIView):
    """Return all files uploaded by the authenticated user."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        files = UploadedFile.objects.filter(user=request.user).order_by('-created_at')
        return Response(UploadedFileSerializer(files, many=True).data)


class FileUrlView(APIView):
    """Return presigned GET URLs for a file's source and processed versions."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            upload_file = UploadedFile.objects.get(pk=pk, user=request.user)
        except UploadedFile.DoesNotExist:
            return Response({'error': 'Not found.'}, status=404)

        s3     = _s3_client()
        key    = upload_file.s3_key
        result = {}

        try:
            result['source_url'] = s3.generate_presigned_url(
                'get_object',
                Params={'Bucket': settings.AWS_UPLOAD_BUCKET, 'Key': key},
                ExpiresIn=PRESIGN_EXPIRES,
            )
        except ClientError as e:
            logger.warning('Failed to generate source URL for file %s: %s', upload_file.id, e)

        if upload_file.status == UploadedFile.Status.COMPLETE:
            try:
                result['processed_url'] = s3.generate_presigned_url(
                    'get_object',
                    Params={'Bucket': settings.AWS_PROCESSED_BUCKET, 'Key': key},
                    ExpiresIn=PRESIGN_EXPIRES,
                )
            except ClientError as e:
                logger.warning('Failed to generate processed URL for file %s: %s', upload_file.id, e)

        return Response(result)


@method_decorator(csrf_exempt, name='dispatch')
class ProcessWebhookView(APIView):
    """Called by the Lambda function when file processing completes."""
    permission_classes = [AllowAny]

    def post(self, request):
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        expected    = f'Bearer {settings.FILEUPLOAD_WEBHOOK_SECRET}'
        if not settings.FILEUPLOAD_WEBHOOK_SECRET or auth_header != expected:
            logger.warning('Fileupload webhook called with invalid or missing secret')
            return Response({'error': 'Unauthorized.'}, status=401)

        ser = WebhookSerializer(data=request.data)
        if not ser.is_valid():
            return Response(ser.errors, status=400)

        data = ser.validated_data
        try:
            upload_file = UploadedFile.objects.get(pk=data['file_id'])
        except UploadedFile.DoesNotExist:
            logger.warning('Webhook received for unknown file %s', data['file_id'])
            return Response({'error': 'File not found.'}, status=404)

        if data['status'] == 'complete':
            upload_file.status        = UploadedFile.Status.COMPLETE
            upload_file.error_message = ''
        else:
            upload_file.status        = UploadedFile.Status.FAILED
            upload_file.error_message = data.get('error', '')

        upload_file.save(update_fields=['status', 'error_message', 'updated_at'])

        file_processed.send(sender=self.__class__, file=upload_file)
        logger.info('File %s processing %s via webhook', upload_file.id, data['status'])
        return Response({'status': 'ok'})
