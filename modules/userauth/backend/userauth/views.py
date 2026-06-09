"""
userauth/views.py — Auth endpoints: register, email verification, password reset, Google OAuth

All endpoints here are AllowAny (pre-login flows).
JWT-authenticated endpoints live elsewhere (profile modules, etc.).

SECURITY NOTES:
- verify_recaptcha() required on register endpoint
- Verification/reset tokens are UUID4 (128-bit); codes are 6-digit (time-limited, email-gated)
- Generic messages used on forgot_password and resend_verification (prevent email enumeration)
- Tokens deleted after use (one-time use)
"""

import logging
import requests as http_requests
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import IntegrityError
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from allauth.socialaccount.providers.google.views import GoogleOAuth2Adapter
from allauth.socialaccount.providers.oauth2.client import OAuth2Client
from dj_rest_auth.registration.views import SocialLoginView

from .models import EmailVerificationToken, PasswordResetToken
from .serializers import RegisterSerializer, CustomTokenObtainPairSerializer
from .emails import send_verification_email, send_password_reset
from .signals import user_email_verified

User = get_user_model()
logger = logging.getLogger(__name__)

FRONTEND_URL = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')


# ============================================================================
# GOOGLE OAUTH
# ============================================================================

class GoogleLogin(SocialLoginView):
    """
    OAuth login with Google via dj-rest-auth.
    Frontend sends Google access_token; backend authenticates and issues JWT.
    """
    adapter_class  = GoogleOAuth2Adapter
    callback_url   = settings.FRONTEND_URL
    client_class   = OAuth2Client


class GoogleRegister(APIView):
    """
    OAuth signup with Google.
    Frontend sends { access_token, username }; backend verifies token with Google,
    creates user, and issues JWT.

    SECURITY:
    - Verifies token by calling Google API (not trusting client-supplied data)
    - Case-insensitive username/email uniqueness check
    - set_unusable_password() for OAuth users (no password login path)
    - user_registered signal fired so other modules can create related records
    """

    def post(self, request):
        access_token = request.data.get('access_token', '').strip()
        username     = request.data.get('username', '').strip().lower()

        if not access_token or not username:
            return Response(
                {'error': 'access_token and username are required'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(username) < 3 or len(username) > 150:
            return Response(
                {'error': 'Username must be 3–150 characters'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not all(c.isalnum() or c == '_' for c in username):
            return Response(
                {'error': 'Username can only contain letters, numbers, and underscores'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if User.objects.filter(username__iexact=username).exists():
            return Response({'error': 'Username already taken'}, status=status.HTTP_409_CONFLICT)

        # Verify Google token
        try:
            google_response = http_requests.get(
                'https://www.googleapis.com/oauth2/v3/userinfo',
                headers={'Authorization': f'Bearer {access_token}'},
                timeout=5,
            )
        except http_requests.RequestException:
            return Response({'error': 'Failed to verify Google token'}, status=status.HTTP_400_BAD_REQUEST)

        if google_response.status_code != 200:
            return Response({'error': 'Invalid Google token'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            google_data = google_response.json()
        except Exception:
            return Response({'error': 'Invalid Google response'}, status=status.HTTP_400_BAD_REQUEST)

        email = google_data.get('email', '').lower().strip()
        if not email:
            return Response({'error': 'Could not get email from Google'}, status=status.HTTP_400_BAD_REQUEST)

        if User.objects.filter(email__iexact=email).exists():
            return Response(
                {'error': 'An account with this email already exists. Please log in instead.'},
                status=status.HTTP_409_CONFLICT,
            )

        try:
            user = User.objects.create_user(
                username=username,
                email=email,
                first_name=google_data.get('given_name', ''),
                last_name=google_data.get('family_name', ''),
                is_active=True,  # OAuth users are active immediately
            )
            user.set_unusable_password()
            user.save()
        except IntegrityError:
            return Response(
                {'error': 'Username or email conflict. Please try again.'},
                status=status.HTTP_409_CONFLICT,
            )

        # Signal: other modules (profiles, etc.) hook in here.
        from .signals import user_registered
        user_registered.send(sender=user.__class__, user=user)

        refresh = RefreshToken.for_user(user)
        return Response({
            'access':  str(refresh.access_token),
            'refresh': str(refresh),
            'user': {'id': user.id, 'username': user.username, 'email': user.email},
        }, status=status.HTTP_201_CREATED)


# ============================================================================
# CUSTOM JWT VIEW
# ============================================================================

class CustomTokenObtainPairView(TokenObtainPairView):
    """JWT login with lowercase username normalization."""
    serializer_class = CustomTokenObtainPairSerializer


# ============================================================================
# EMAIL/PASSWORD AUTH ENDPOINTS
# ============================================================================

@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    """
    POST /api/userauth/register/ — Sign up new user.

    Requires: { username, email, password, captcha_token }
    Returns:  { message, email }

    FLOW: reCAPTCHA → validate → create User (inactive) → create token → send email
    Email failure is non-fatal; user can request resend from login page.
    """
    captcha_token = request.data.get('captcha_token', '').strip()

    logger.debug('Registration attempt: username=%s', request.data.get('username'))

    if not captcha_token:
        return Response(
            {'error': 'reCAPTCHA token is required. Please refresh the page and try again.', 'code': 'missing_captcha_token'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    is_valid, recaptcha_error = verify_recaptcha(captcha_token, action='register')
    if not is_valid:
        logger.warning('Registration blocked by reCAPTCHA: %s', recaptcha_error)
        return Response(
            {'error': recaptcha_error or 'reCAPTCHA verification failed. Please try again.', 'code': 'recaptcha_failed'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    serializer = RegisterSerializer(data=request.data)
    if not serializer.is_valid():
        logger.warning('Registration validation failed: %s', serializer.errors)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    try:
        user = serializer.save()
        user.is_active = False
        user.save()
    except Exception as e:
        logger.error('User creation failed: %s: %s', type(e).__name__, e, exc_info=True)
        return Response(
            {'error': 'Could not create account. Please try again later.', 'code': 'user_creation_failed'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    try:
        EmailVerificationToken.objects.filter(user=user).delete()
        token = EmailVerificationToken.objects.create(user=user)
    except Exception as e:
        logger.error('Token creation failed: %s: %s', type(e).__name__, e, exc_info=True)
        return Response(
            {'error': 'Could not set up email verification. Please try again later.', 'code': 'token_creation_failed'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    email_sent = False
    if user.email:
        try:
            send_verification_email(user, token.token, token.code)
            email_sent = True
        except Exception as e:
            # Non-fatal — user can resend from login page
            logger.warning('Failed to send verification email to %s: %s', user.email, e, exc_info=True)

    return Response({
        'message': (
            'Account created! Please check your email to verify your account.'
            if email_sent
            else 'Account created, but we could not send a verification email. '
                 'Please check your email or request a new code from the login page.'
        ),
        'email': user.email,
    }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_email_code(request):
    """
    POST /api/userauth/verify-email-code/ — Verify email with 6-digit code (signup inline form).

    Expects: { email, code }
    Returns: { message, user, access, refresh }

    RATE LIMITING: Should be rate-limited (brute-force 6-digit codes).
    """
    email = request.data.get('email', '').lower().strip()
    code  = request.data.get('code', '').strip()

    if not email or not code:
        return Response({'error': 'Email and code are required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user  = User.objects.get(email__iexact=email, is_active=False)
        token = EmailVerificationToken.objects.get(user=user, code=code)
    except (User.DoesNotExist, EmailVerificationToken.DoesNotExist):
        return Response(
            {'error': 'Invalid email or code. Please check and try again.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if token.is_expired():
        token.delete()
        return Response({'error': 'This code has expired. Please request a new one.'}, status=status.HTTP_400_BAD_REQUEST)

    user.is_active = True
    user.save()
    token.delete()

    # Signal: welcome emails, onboarding hooks, etc. listen here.
    user_email_verified.send(sender=user.__class__, user=user)

    refresh = RefreshToken.for_user(user)
    return Response({
        'message': 'Email verified successfully.',
        'user':    user.username,
        'access':  str(refresh.access_token),
        'refresh': str(refresh),
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_email(request):
    """
    POST /api/userauth/verify-email/ — Verify email via UUID link token.

    Expects: { token }
    Returns: { message, user, access, refresh }

    Different from verify_email_code: this is the link-click flow (/verify-email/:token).
    """
    token_str = request.data.get('token', '').strip()
    if not token_str:
        return Response({'error': 'Token is required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        token = EmailVerificationToken.objects.select_related('user').get(token=token_str)
    except EmailVerificationToken.DoesNotExist:
        return Response({'error': 'Invalid or expired verification link'}, status=status.HTTP_400_BAD_REQUEST)

    if token.is_expired():
        token.delete()
        return Response({'error': 'This link has expired. Please register again.'}, status=status.HTTP_400_BAD_REQUEST)

    user = token.user
    user.is_active = True
    user.save()
    token.delete()

    # Signal: welcome emails, onboarding hooks, etc. listen here.
    user_email_verified.send(sender=user.__class__, user=user)

    refresh = RefreshToken.for_user(user)
    return Response({
        'message': 'Email verified successfully.',
        'user':    user.username,
        'access':  str(refresh.access_token),
        'refresh': str(refresh),
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
def resend_verification(request):
    """
    POST /api/userauth/resend-verification/ — Resend verification email/code.

    Expects: { email }
    Returns: { message } (generic — does not reveal whether email exists)

    RATE LIMITING: Should be rate-limited (spam prevention).
    """
    email = request.data.get('email', '').lower().strip()
    if not email:
        return Response({'error': 'Email is required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user = User.objects.get(email__iexact=email, is_active=False)
    except User.DoesNotExist:
        # Generic response to prevent email enumeration
        return Response({
            'message': 'If that email exists and is not yet verified, we have sent a new verification link.'
        }, status=status.HTTP_200_OK)

    EmailVerificationToken.objects.filter(user=user).delete()
    token = EmailVerificationToken.objects.create(user=user)

    try:
        send_verification_email(user, token.token, token.code)
    except Exception:
        pass  # Non-fatal; silent failure

    return Response({
        'message': 'If that email exists and is not yet verified, we have sent a new verification link.'
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
def forgot_password(request):
    """
    POST /api/userauth/forgot-password/ — Request a password reset email.

    Expects: { email }
    Returns: { message } (generic — does not reveal whether email exists)

    RATE LIMITING: Should be rate-limited (spam prevention).
    """
    email = request.data.get('email', '').lower().strip()
    if not email:
        return Response({'error': 'Email is required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user = User.objects.get(email__iexact=email, is_active=True)
        PasswordResetToken.objects.filter(user=user, used=False).update(used=True)
        token = PasswordResetToken.objects.create(user=user)
        send_password_reset(user, token.token)
    except User.DoesNotExist:
        pass  # Don't reveal whether email exists

    return Response({
        'message': 'If that email exists, we have sent a password reset link.'
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
def reset_password(request):
    """
    POST /api/userauth/reset-password/ — Reset password with a UUID token.

    Expects: { token, password }
    Returns: { message }

    SECURITY: token checked for is_expired() and used=False; marked used after reset.
    """
    token_str = request.data.get('token', '').strip()
    password  = request.data.get('password', '')

    if not token_str or not password:
        return Response({'error': 'Token and password are required'}, status=status.HTTP_400_BAD_REQUEST)

    if len(password) < 8:
        return Response({'error': 'Password must be at least 8 characters'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        token = PasswordResetToken.objects.select_related('user').get(token=token_str, used=False)
    except PasswordResetToken.DoesNotExist:
        return Response({'error': 'Invalid or expired reset link'}, status=status.HTTP_400_BAD_REQUEST)

    if token.is_expired():
        return Response({'error': 'This link has expired. Please request a new one.'}, status=status.HTTP_400_BAD_REQUEST)

    user = token.user
    user.set_password(password)
    user.save()
    token.used = True
    token.save()

    return Response({'message': 'Password reset successfully. You can now log in with your new password.'})


# ============================================================================
# RECAPTCHA HELPERS
# ============================================================================

def verify_recaptcha(token, action='register', min_score=0.5):
    """
    Verify reCAPTCHA v3 token with Google's API (standard or Enterprise).

    Returns (True, None) on success; (False, error_message) on failure.
    Supports both standard reCAPTCHA v3 and Enterprise API based on settings.
    """
    if not token or not isinstance(token, str):
        return False, 'reCAPTCHA token missing or invalid'

    secret_key = getattr(settings, 'RECAPTCHA_SECRET_KEY', None)
    if not secret_key:
        logger.error('reCAPTCHA not configured (missing RECAPTCHA_SECRET_KEY)')
        return False, 'reCAPTCHA not configured (missing SECRET_KEY)'

    site_key   = getattr(settings, 'RECAPTCHA_SITE_KEY', None)
    project_id = getattr(settings, 'RECAPTCHA_PROJECT_ID', None)
    threshold  = getattr(settings, 'RECAPTCHA_THRESHOLD', min_score)
    is_enterprise = project_id is not None

    try:
        if is_enterprise:
            url = f'https://recaptchaenterprise.googleapis.com/v1/projects/{project_id}/assessments?key={secret_key}'
            payload = {'event': {'token': token, 'expectedAction': action, 'siteKey': site_key}}
        else:
            url = 'https://www.google.com/recaptcha/api/siteverify'
            payload = {'secret': secret_key, 'response': token}

        response = http_requests.post(url, json=payload, timeout=5)
        response.raise_for_status()
        data = response.json()

    except http_requests.exceptions.Timeout:
        return False, 'reCAPTCHA verification timed out. Please try again.'
    except http_requests.exceptions.ConnectionError:
        return False, 'Could not reach reCAPTCHA service. Check your connection.'
    except http_requests.exceptions.HTTPError:
        return False, 'reCAPTCHA API error. Please try again.'
    except (ValueError, KeyError):
        return False, 'Invalid response from reCAPTCHA service'
    except Exception as e:
        logger.error('Unexpected reCAPTCHA error: %s: %s', type(e).__name__, e)
        return False, 'Unexpected error during reCAPTCHA verification'

    if is_enterprise:
        return _validate_enterprise_response(data, action, threshold)
    return _validate_standard_response(data, action, threshold)


def _validate_standard_response(data, action, threshold):
    """Validate standard reCAPTCHA v3 API response."""
    if not data.get('success'):
        error_codes = data.get('error-codes', [])
        return False, f"reCAPTCHA verification failed: {', '.join(error_codes) or 'unknown error'}"

    received_action = data.get('action')
    if received_action != action:
        return False, f"Action mismatch (expected '{action}', got '{received_action}')"

    score = data.get('score', 0.0)
    if score < threshold:
        return False, f'reCAPTCHA score too low ({score:.2f} < {threshold}). Possible bot activity.'

    logger.info('reCAPTCHA passed. Score: %.2f, Action: %s', score, action)
    return True, None


def _validate_enterprise_response(data, action, threshold):
    """Validate reCAPTCHA Enterprise API response."""
    if 'error' in data:
        return False, f"reCAPTCHA API error: {data.get('error', {}).get('message', 'unknown')}"

    token_props   = data.get('tokenProperties', {})
    risk_analysis = data.get('riskAnalysis', {})

    if not token_props.get('valid'):
        reason = token_props.get('invalidReason', 'unknown')
        return False, f'Invalid reCAPTCHA token: {reason}'

    received_action = token_props.get('action')
    if received_action != action:
        return False, f"Action mismatch (expected '{action}', got '{received_action}')"

    score = risk_analysis.get('score', 0.0)
    if score < threshold:
        return False, f'reCAPTCHA score too low ({score:.2f} < {threshold}). Possible bot activity.'

    logger.info('reCAPTCHA Enterprise passed. Score: %.2f, Action: %s', score, action)
    return True, None
