"""
orgs/module_settings.py — Configuration notes for the orgs module.

No extra pip packages, Django apps, or middleware are required.

## X-Org-ID header convention

When a view in another module needs to know which org is active for a request,
the frontend sends an `X-Org-ID: <id>` header.  Read it in your view:

    org_id = request.headers.get('X-Org-ID')

In the frontend, use `useOrg()` from @modules/orgs to get the active org, then
pass it via apiFetch options.headers:

    import { useOrg } from '@modules/orgs'

    const { activeOrg } = useOrg()
    apiFetch('/api/yourmodule/resource/', {
        headers: activeOrg ? { 'X-Org-ID': String(activeOrg.id) } : {},
    })

Remember to validate that request.user is actually a member of that org
before scoping queries to it.
"""
