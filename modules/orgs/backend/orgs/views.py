import logging

from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from django.utils import timezone
from datetime import timedelta

from .emails import send_org_invite
from .models import Membership, OrgInvite, Organization
from .serializers import MembershipSerializer, OrgInviteSerializer, OrganizationSerializer, PendingInviteSerializer

User = get_user_model()
logger = logging.getLogger(__name__)

_ROLE_ORDER = {'owner': 3, 'admin': 2, 'member': 1}


def _require_membership(request, org_id, min_role='member'):
    """Return (org, membership) or raise 403/404."""
    org = get_object_or_404(Organization, pk=org_id)
    try:
        membership = Membership.objects.get(user=request.user, org=org)
    except Membership.DoesNotExist:
        raise PermissionDenied('You are not a member of this organisation.')
    if _ROLE_ORDER.get(membership.role, 0) < _ROLE_ORDER.get(min_role, 0):
        raise PermissionDenied('Insufficient role for this action.')
    return org, membership


class OrgListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        memberships = Membership.objects.filter(user=request.user).select_related('org')
        result = []
        for m in memberships:
            data = OrganizationSerializer(m.org).data
            data['role'] = m.role
            result.append(data)
        return Response(result)

    def post(self, request):
        serializer = OrganizationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)
        org = serializer.save()
        Membership.objects.create(user=request.user, org=org, role='owner')
        data = serializer.data
        data['role'] = 'owner'
        return Response(data, status=201)


class OrgDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id):
        org, membership = _require_membership(request, org_id, min_role='member')
        data = OrganizationSerializer(org).data
        data['role'] = membership.role
        return Response(data)

    def put(self, request, org_id):
        org, _ = _require_membership(request, org_id, min_role='owner')
        serializer = OrganizationSerializer(org, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request, org_id):
        org, _ = _require_membership(request, org_id, min_role='owner')
        org.delete()
        return Response(status=204)


class MemberListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id):
        _require_membership(request, org_id, min_role='member')
        members = Membership.objects.filter(org_id=org_id).select_related('user')
        return Response(MembershipSerializer(members, many=True).data)


class MemberDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def patch(self, request, org_id, user_id):
        org, actor = _require_membership(request, org_id, min_role='admin')
        target = get_object_or_404(Membership, org=org, user_id=user_id)
        new_role = request.data.get('role')
        if new_role not in ('owner', 'admin', 'member'):
            return Response({'error': 'Invalid role.'}, status=400)
        if target.role == 'owner' or new_role == 'owner':
            if actor.role != 'owner':
                return Response({'error': 'Only owners can change owner roles.'}, status=403)
        if target.role == 'owner' and new_role != 'owner':
            if Membership.objects.filter(org=org, role='owner').count() <= 1:
                return Response({'error': 'Organisation must have at least one owner.'}, status=400)
        target.role = new_role
        target.save()
        return Response(MembershipSerializer(target).data)

    def delete(self, request, org_id, user_id):
        org, actor = _require_membership(request, org_id, min_role='admin')
        target = get_object_or_404(Membership, org=org, user_id=user_id)
        if target.role == 'owner':
            if actor.role != 'owner':
                return Response({'error': 'Only owners can remove an owner.'}, status=403)
            if Membership.objects.filter(org=org, role='owner').count() <= 1:
                return Response({'error': 'Organisation must have at least one owner.'}, status=400)
        target.delete()
        return Response(status=204)


class InviteListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, org_id):
        _require_membership(request, org_id, min_role='admin')
        invites = OrgInvite.objects.filter(org_id=org_id, accepted=False)
        return Response(OrgInviteSerializer(invites, many=True).data)

    def post(self, request, org_id):
        org, _ = _require_membership(request, org_id, min_role='admin')
        email = request.data.get('email', '').strip().lower()
        if not email:
            return Response({'error': 'Email is required.'}, status=400)

        if Membership.objects.filter(org=org, user__email__iexact=email).exists():
            return Response({'error': 'User is already a member.'}, status=400)

        invite, _ = OrgInvite.objects.get_or_create(
            org=org, email=email,
            defaults={'invited_by': request.user},
        )
        if invite.accepted:
            return Response({'error': 'This email already accepted an invite.'}, status=400)

        try:
            send_org_invite(invite, org, request.user)
        except Exception:
            logger.error('Failed to send org invite', exc_info=True, extra={'org_id': org_id, 'email': email})
            return Response({'error': 'Failed to send invite email.'}, status=502)

        return Response(OrgInviteSerializer(invite).data, status=201)


class PendingInviteListView(APIView):
    """
    GET /api/orgs/my-invites/ — List non-expired pending invites for the authenticated user's email.
    Used during signup to surface invites before they navigate to the dashboard.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cutoff = timezone.now() - timedelta(days=7)
        invites = OrgInvite.objects.filter(
            email__iexact=request.user.email,
            accepted=False,
            created_at__gte=cutoff,
        ).select_related('org', 'invited_by')
        return Response(PendingInviteSerializer(invites, many=True).data)


class InviteAcceptView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, token):
        invite = get_object_or_404(OrgInvite, token=token)
        if invite.accepted:
            return Response({'error': 'Invite already used.'}, status=400)
        if invite.is_expired():
            return Response({'error': 'Invite has expired.'}, status=400)

        if not request.user.is_authenticated:
            return Response(
                {'error': 'Authentication required.', 'next': f'/orgs/invite/{token}'},
                status=401,
            )

        membership, _ = Membership.objects.get_or_create(
            user=request.user,
            org=invite.org,
            defaults={'role': 'member'},
        )
        invite.accepted = True
        invite.save()

        data = OrganizationSerializer(invite.org).data
        data['role'] = membership.role
        return Response(data)
