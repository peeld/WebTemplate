from django.urls import path

from . import views

app_name = 'orgs'

urlpatterns = [
    path('', views.OrgListCreateView.as_view(), name='list'),
    path('my-invites/', views.PendingInviteListView.as_view(), name='my_invites'),
    path('<int:org_id>/', views.OrgDetailView.as_view(), name='detail'),
    path('<int:org_id>/members/', views.MemberListView.as_view(), name='members'),
    path('<int:org_id>/members/<int:user_id>/', views.MemberDetailView.as_view(), name='member_detail'),
    path('<int:org_id>/invites/', views.InviteListCreateView.as_view(), name='invites'),
    path('invites/<uuid:token>/accept/', views.InviteAcceptView.as_view(), name='invite_accept'),
]
