import logging

from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

from .models import Ticket, TicketAttachment, TicketMessage
from .serializers import TicketAttachmentSerializer, TicketSerializer, TicketDetailSerializer, TicketMessageSerializer
from .emails import send_ticket_created, send_new_message

logger = logging.getLogger(__name__)


class TicketListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.is_staff or request.user.is_superuser:
            tickets = Ticket.objects.all()
        else:
            tickets = Ticket.objects.filter(user=request.user)
        serializer = TicketSerializer(tickets, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = TicketSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ticket = serializer.save(user=request.user)
        try:
            send_ticket_created(ticket)
        except Exception:
            logger.error('Failed to send ticket_created email for ticket %s', ticket.pk, exc_info=True)
        return Response(TicketSerializer(ticket).data, status=201)


class TicketDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_ticket(self, request, pk):
        ticket = get_object_or_404(Ticket, pk=pk)
        is_owner = ticket.user == request.user
        is_staff = request.user.is_staff or request.user.is_superuser
        if not (is_owner or is_staff):
            return None, False, False
        return ticket, is_owner, is_staff

    def get(self, request, pk):
        ticket, is_owner, is_staff = self._get_ticket(request, pk)
        if ticket is None:
            return Response({'detail': 'Not found.'}, status=404)
        serializer = TicketDetailSerializer(ticket)
        return Response(serializer.data)

    def patch(self, request, pk):
        ticket, is_owner, is_staff = self._get_ticket(request, pk)
        if ticket is None:
            return Response({'detail': 'Not found.'}, status=404)

        data = request.data.copy()
        if not is_staff:
            # Owners may only close their own ticket
            allowed = {k: v for k, v in data.items() if k == 'status' and v == 'closed'}
            if len(allowed) != len(data):
                return Response({'detail': 'You may only set status to closed.'}, status=403)
            data = allowed

        serializer = TicketDetailSerializer(ticket, data=data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(TicketDetailSerializer(ticket).data)


class TicketMessageListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def _check_access(self, request, pk):
        ticket = get_object_or_404(Ticket, pk=pk)
        is_owner = ticket.user == request.user
        is_staff = request.user.is_staff or request.user.is_superuser
        if not (is_owner or is_staff):
            return None, False
        return ticket, is_staff

    def get(self, request, pk):
        ticket, _ = self._check_access(request, pk)
        if ticket is None:
            return Response({'detail': 'Not found.'}, status=404)
        messages = ticket.messages.all()
        serializer = TicketMessageSerializer(messages, many=True)
        return Response(serializer.data)

    def post(self, request, pk):
        ticket, is_staff = self._check_access(request, pk)
        if ticket is None:
            return Response({'detail': 'Not found.'}, status=404)

        serializer = TicketMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        message = serializer.save(
            ticket=ticket,
            author=request.user,
            is_staff_reply=is_staff,
        )
        try:
            send_new_message(message)
        except Exception:
            logger.error('Failed to send new_message email for message %s', message.pk, exc_info=True)
        return Response(TicketMessageSerializer(message).data, status=201)


class TicketAttachmentListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def _check_access(self, request, pk):
        ticket = get_object_or_404(Ticket, pk=pk)
        is_owner = ticket.user == request.user
        is_staff = request.user.is_staff or request.user.is_superuser
        if not (is_owner or is_staff):
            return None
        return ticket

    def get(self, request, pk):
        ticket = self._check_access(request, pk)
        if ticket is None:
            return Response({'detail': 'Not found.'}, status=404)
        attachments = ticket.attachments.all()
        return Response(TicketAttachmentSerializer(attachments, many=True).data)

    def post(self, request, pk):
        ticket = self._check_access(request, pk)
        if ticket is None:
            return Response({'detail': 'Not found.'}, status=404)
        serializer = TicketAttachmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(ticket=ticket, uploaded_by=request.user)
        return Response(serializer.data, status=201)


class AdminTicketListView(APIView):
    permission_classes = [IsAdminUser]

    def get(self, request):
        tickets = Ticket.objects.all()
        status = request.query_params.get('status')
        priority = request.query_params.get('priority')
        if status:
            tickets = tickets.filter(status=status)
        if priority:
            tickets = tickets.filter(priority=priority)
        serializer = TicketSerializer(tickets, many=True)
        return Response(serializer.data)
