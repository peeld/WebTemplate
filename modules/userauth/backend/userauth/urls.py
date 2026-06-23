"""
userauth/urls.py -- URL patterns for auth module

Mounted by core at /api/userauth/ so all paths here are relative to that prefix.
"""

from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

app_name = 'userauth'

urlpatterns = [
    path('register/',      views.RegisterView.as_view(),      name='register'),
    path('login/',         views.CustomTokenObtainPairView.as_view(), name='login'),
    path('token/refresh/', TokenRefreshView.as_view(),         name='token_refresh'),

    path('verify-email/',        views.VerifyEmailView.as_view(),        name='verify_email'),
    path('verify-email-code/',   views.VerifyEmailCodeView.as_view(),    name='verify_email_code'),
    path('resend-verification/', views.ResendVerificationView.as_view(), name='resend_verification'),

    path('forgot-password/', views.ForgotPasswordView.as_view(), name='forgot_password'),
    path('reset-password/',  views.ResetPasswordView.as_view(),  name='reset_password'),

    path('google/',          views.GoogleLogin.as_view(),    name='google_login'),
    path('google/register/', views.GoogleRegister.as_view(), name='google_register'),
]
