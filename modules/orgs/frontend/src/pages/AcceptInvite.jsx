import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { orgsApi } from '../api'
import { useOrg } from '../context/OrgContext'

export default function AcceptInvite() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { refreshOrgs, switchOrg } = useOrg()
  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState('')
  const [orgId, setOrgId] = useState(null)

  useEffect(() => {
    const accept = async () => {
      try {
        const res = await orgsApi.acceptInvite(token)
        if (res.status === 401) {
          navigate(`/login?next=/orgs/invite/${token}`)
          return
        }
        if (!res.ok) {
          const d = await res.json()
          setStatus('error')
          setMessage(d.error || 'This invite is invalid or has expired.')
          return
        }
        const org = await res.json()
        await refreshOrgs()
        switchOrg(org)
        setOrgId(org.id)
        setStatus('success')
        setMessage(org.name)
        setTimeout(() => navigate(`/orgs/${org.id}/settings`), 1500)
      } catch {
        setStatus('error')
        setMessage('Something went wrong. Please try again.')
      }
    }
    accept()
  }, [token, navigate, refreshOrgs, switchOrg])

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 480, textAlign: 'center' }}>
        {status === 'loading' && <p>Accepting invitation…</p>}
        {status === 'success' && (
          <div>
            <p className="has-text-success is-size-5">
              You've joined <strong>{message}</strong>!
            </p>
            <p className="has-text-grey is-size-7" style={{ marginTop: '0.5rem' }}>Redirecting…</p>
          </div>
        )}
        {status === 'error' && (
          <div>
            <p className="has-text-danger">{message}</p>
            <Link to="/" className="button is-primary" style={{ marginTop: '1rem' }}>
              Go home
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}
