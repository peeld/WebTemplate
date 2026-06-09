from django.test import TestCase
from django.urls import reverse


class UserauthModuleTests(TestCase):

    def test_module_root_reachable(self):
        """Smoke test — confirms the module URL is registered and returns 200."""
        response = self.client.get(reverse('userauth:root'))
        self.assertEqual(response.status_code, 200)

    def test_module_root_identifies_module(self):
        response = self.client.get(reverse('userauth:root'))
        self.assertEqual(response.json()['module'], 'userauth')
