from django.urls import path

from .views import UserauthRootView

app_name = 'userauth'

urlpatterns = [
    path('', UserauthRootView.as_view(), name='root'),
]
