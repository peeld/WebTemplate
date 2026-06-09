import logging

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny

logger = logging.getLogger(__name__)


class UserauthRootView(APIView):
    """Placeholder — confirms the module is installed and its URL is reachable."""

    permission_classes = [AllowAny]

    def get(self, request):
        return Response({'module': 'userauth', 'status': 'ok'})
