import logging

from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

logger = logging.getLogger(__name__)


class HelloWorldView(APIView):
    """Returns a greeting from the helloworld module.

    Unauthenticated so the frontend can call it before any auth module
    is installed. Serves as a smoke test that the full request cycle works.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        logger.debug("HelloWorldView called from %s", request.META.get('REMOTE_ADDR'))
        return Response({
            'message': 'Hello from the helloworld module.',
            'module': 'helloworld',
        })
