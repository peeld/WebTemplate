from django.test import TestCase
from django.urls import reverse


class HelloWorldViewTests(TestCase):

    def test_returns_200(self):
        response = self.client.get(reverse('helloworld:hello'))
        self.assertEqual(response.status_code, 200)

    def test_returns_expected_message(self):
        response = self.client.get(reverse('helloworld:hello'))
        self.assertEqual(response.json()['message'], 'Hello from the helloworld module.')

    def test_returns_module_name(self):
        response = self.client.get(reverse('helloworld:hello'))
        self.assertEqual(response.json()['module'], 'helloworld')

    def test_unauthenticated_access_allowed(self):
        """Module must be reachable without credentials."""
        response = self.client.get(reverse('helloworld:hello'))
        self.assertNotEqual(response.status_code, 403)

    def test_only_get_allowed(self):
        response = self.client.post(reverse('helloworld:hello'), {})
        self.assertEqual(response.status_code, 405)
