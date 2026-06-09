from django.urls import path

from .views import HelloWorldView

app_name = 'helloworld'

urlpatterns = [
    path('', HelloWorldView.as_view(), name='hello'),
]
