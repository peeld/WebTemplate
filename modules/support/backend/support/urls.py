from django.urls import path
from .views import (
    AdminTicketListView,
    TicketAttachmentListCreateView,
    TicketDetailView,
    TicketListCreateView,
    TicketMessageListCreateView,
)

app_name = 'support'

urlpatterns = [
    path('tickets/', TicketListCreateView.as_view(), name='ticket-list-create'),
    path('tickets/<int:pk>/', TicketDetailView.as_view(), name='ticket-detail'),
    path('tickets/<int:pk>/messages/', TicketMessageListCreateView.as_view(), name='ticket-messages'),
    path('tickets/<int:pk>/attachments/', TicketAttachmentListCreateView.as_view(), name='ticket-attachments'),
    path('admin/tickets/', AdminTicketListView.as_view(), name='admin-ticket-list'),
]
