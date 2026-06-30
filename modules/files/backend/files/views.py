import boto3
from django.conf import settings
from django.db import transaction
from django.shortcuts import get_object_or_404, redirect
from rest_framework import status
from rest_framework.permissions import IsAdminUser, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Release, ReleaseAsset
from .serializers import ReleaseSerializer, ReleaseAssetSerializer


class ReleaseListView(APIView):
    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAdminUser()]
        return [AllowAny()]

    def get(self, request):
        qs = Release.objects.all()
        if not (request.user.is_authenticated and request.user.is_staff):
            qs = qs.filter(status='published')
        product_id = request.query_params.get('product_id')
        if product_id:
            qs = qs.filter(product_id=product_id)
        status_param = request.query_params.get('status')
        if status_param and request.user.is_authenticated and request.user.is_staff:
            qs = qs.filter(status=status_param)
        return Response(ReleaseSerializer(qs, many=True).data)

    def post(self, request):
        serializer = ReleaseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class LatestReleaseView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        product_id = request.query_params.get('product_id')
        if not product_id:
            return Response({'detail': 'product_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        release = Release.objects.filter(
            product_id=product_id,
            status='published',
            is_latest=True,
        ).first()
        if not release:
            return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(ReleaseSerializer(release).data)


class ReleaseDetailView(APIView):
    def get_permissions(self):
        if self.request.method == 'GET':
            return [AllowAny()]
        return [IsAdminUser()]

    def _get_release(self, pk, request):
        qs = Release.objects.all()
        if not (request.user.is_authenticated and request.user.is_staff):
            qs = qs.filter(status='published')
        return get_object_or_404(qs, pk=pk)

    def get(self, request, pk):
        release = self._get_release(pk, request)
        return Response(ReleaseSerializer(release).data)

    def patch(self, request, pk):
        release = get_object_or_404(Release, pk=pk)
        serializer = ReleaseSerializer(release, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, pk):
        release = get_object_or_404(Release, pk=pk)
        release.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SetLatestView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, pk):
        release = get_object_or_404(Release, pk=pk)
        with transaction.atomic():
            Release.objects.filter(product_id=release.product_id, is_latest=True).update(is_latest=False)
            release.is_latest = True
            release.save(update_fields=['is_latest'])
        return Response(ReleaseSerializer(release).data)


class AssetListView(APIView):
    permission_classes = [IsAdminUser]

    def post(self, request, release_id):
        release = get_object_or_404(Release, pk=release_id)
        serializer = ReleaseAssetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(release=release)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class AssetDetailView(APIView):
    permission_classes = [IsAdminUser]

    def patch(self, request, release_id, asset_id):
        asset = get_object_or_404(ReleaseAsset, pk=asset_id, release_id=release_id)
        serializer = ReleaseAssetSerializer(asset, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, release_id, asset_id):
        asset = get_object_or_404(ReleaseAsset, pk=asset_id, release_id=release_id)
        asset.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AssetDownloadView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, release_id, asset_id):
        asset = get_object_or_404(
            ReleaseAsset,
            pk=asset_id,
            release_id=release_id,
            release__status='published',
        )
        s3 = boto3.client(
            's3',
            aws_access_key_id=settings.FILES_AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.FILES_AWS_SECRET_ACCESS_KEY,
            region_name=settings.FILES_AWS_REGION,
        )
        url = s3.generate_presigned_url(
            'get_object',
            Params={'Bucket': asset.s3_bucket, 'Key': asset.s3_key},
            ExpiresIn=getattr(settings, 'FILES_S3_PRESIGNED_URL_EXPIRY', 3600),
        )
        return redirect(url)
