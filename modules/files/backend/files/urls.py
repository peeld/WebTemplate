from django.urls import path
from .views import (
    ReleaseListView, LatestReleaseView, ReleaseDetailView,
    SetLatestView, AssetListView, AssetDetailView, AssetDownloadView,
)

app_name = 'files'

urlpatterns = [
    path('releases/',                                                    ReleaseListView.as_view(),    name='release-list'),
    path('releases/latest/',                                             LatestReleaseView.as_view(),  name='release-latest'),
    path('releases/<int:pk>/',                                           ReleaseDetailView.as_view(),  name='release-detail'),
    path('releases/<int:pk>/set-latest/',                                SetLatestView.as_view(),      name='release-set-latest'),
    path('releases/<int:release_id>/assets/',                            AssetListView.as_view(),      name='asset-list'),
    path('releases/<int:release_id>/assets/<int:asset_id>/',             AssetDetailView.as_view(),    name='asset-detail'),
    path('releases/<int:release_id>/assets/<int:asset_id>/download/',    AssetDownloadView.as_view(),  name='asset-download'),
]
