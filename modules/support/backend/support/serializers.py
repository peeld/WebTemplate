from rest_framework import serializers
from .models import Ticket, TicketAttachment, TicketMessage


class TicketMessageSerializer(serializers.ModelSerializer):
    author = serializers.CharField(source='author.username', read_only=True)

    class Meta:
        model = TicketMessage
        fields = ['id', 'author', 'body', 'is_staff_reply', 'created_at']
        read_only_fields = ['id', 'author', 'is_staff_reply', 'created_at']


class TicketSerializer(serializers.ModelSerializer):
    user = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = Ticket
        fields = ['id', 'user', 'title', 'description', 'status', 'priority', 'created_at', 'updated_at']
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']


class TicketAttachmentSerializer(serializers.ModelSerializer):
    uploaded_by = serializers.CharField(source='uploaded_by.username', read_only=True)

    class Meta:
        model = TicketAttachment
        fields = ['id', 'ticket', 'message', 'file_id', 'original_filename', 'uploaded_by', 'created_at']
        read_only_fields = ['id', 'ticket', 'uploaded_by', 'created_at']


class TicketDetailSerializer(serializers.ModelSerializer):
    user = serializers.CharField(source='user.username', read_only=True)
    messages = TicketMessageSerializer(many=True, read_only=True)

    class Meta:
        model = Ticket
        fields = ['id', 'user', 'title', 'description', 'status', 'priority', 'created_at', 'updated_at', 'messages']
        read_only_fields = ['id', 'user', 'title', 'description', 'created_at', 'updated_at', 'messages']
