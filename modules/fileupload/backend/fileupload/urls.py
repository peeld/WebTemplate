from django.urls import path

from .views import ConfirmView, FileListView, FileUrlView, PresignView, ProcessWebhookView

app_name = 'fileupload'

urlpatterns = [
    path('presign/',             PresignView.as_view(),        name='presign'),
    path('confirm/<uuid:pk>/',   ConfirmView.as_view(),        name='confirm'),
    path('files/',               FileListView.as_view(),       name='file-list'),
    path('files/<uuid:pk>/url/', FileUrlView.as_view(),        name='file-url'),
    path('webhook/',             ProcessWebhookView.as_view(), name='webhook'),
]
