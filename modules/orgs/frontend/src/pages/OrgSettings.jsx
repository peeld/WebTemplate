import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { orgsApi } from '../api'
import { useOrg } from '../context/OrgContext'

export default function OrgSettings() {
  const { orgId } = useParams()
  const { refreshOrgs, switchOrg } = useOrg()
  const navigate = useNavigate()

  const [org, setOrg] = useState(null)
  const [members, setMembers] = useState([])
  const [invites, setInvites] = useState([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [editName, setEditName] = useState('')
  const [tab, setTab] = useState('members')
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [loading, setLoading] = useState(true)
  const [myRole, setMyRole] = useState(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [orgRes, membersRes] = await Promise.all([
          orgsApi.detail(orgId),
          orgsApi.members(orgId),
        ])
        if (!orgRes.ok) { navigate('/'); return }
        const orgData = await orgRes.json()
        const membersData = await membersRes.json()
        setOrg(orgData)
        setEditName(orgData.name)
        setMyRole(orgData.role)
        setMembers(membersData)

        if (['owner', 'admin'].includes(orgData.role)) {
          const invRes = await orgsApi.invites(orgId)
          if (invRes.ok) setInvites(await invRes.json())
        }
      } catch {
        navigate('/')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [orgId, navigate])

  const flash = (msg) => {
    setSuccess(msg)
    setTimeout(() => setSuccess(null), 3000)
  }

  const handleRename = async (e) => {
    e.preventDefault()
    setError(null)
    const res = await orgsApi.update(orgId, { name: editName })
    if (!res.ok) {
      const d = await res.json()
      setError(d.name?.[0] || d.error || 'Failed to update name.')
      return
    }
    const updated = await res.json()
    setOrg(updated)
    await refreshOrgs()
    flash('Name updated.')
  }

  const handleRoleChange = async (userId, role) => {
    setError(null)
    const res = await orgsApi.updateMemberRole(orgId, userId, role)
    if (res.ok) {
      const updated = await res.json()
      setMembers(ms => ms.map(m => m.user.id === userId ? updated : m))
    } else {
      const d = await res.json()
      setError(d.error || 'Failed to update role.')
    }
  }

  const handleRemoveMember = async (userId, username) => {
    if (!confirm(`Remove ${username} from this organisation?`)) return
    setError(null)
    const res = await orgsApi.removeMember(orgId, userId)
    if (res.ok) {
      setMembers(ms => ms.filter(m => m.user.id !== userId))
    } else {
      const d = await res.json()
      setError(d.error || 'Failed to remove member.')
    }
  }

  const handleInvite = async (e) => {
    e.preventDefault()
    setError(null)
    const res = await orgsApi.createInvite(orgId, inviteEmail)
    if (!res.ok) {
      const d = await res.json()
      setError(d.error || 'Failed to send invite.')
      return
    }
    const invite = await res.json()
    setInvites(iv => [invite, ...iv])
    setInviteEmail('')
    flash('Invite sent.')
  }

  const handleDelete = async () => {
    if (!confirm(`Delete "${org.name}" permanently? This cannot be undone.`)) return
    const res = await orgsApi.delete(orgId)
    if (res.ok) {
      await refreshOrgs()
      navigate('/')
    }
  }

  if (loading) {
    return <section className="section"><div className="container">Loading…</div></section>
  }
  if (!org) return null

  const isOwner = myRole === 'owner'
  const isAdmin = myRole === 'owner' || myRole === 'admin'

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 720 }}>
        <h1 className="title">{org.name}</h1>
        <p className="subtitle has-text-grey">Organisation settings</p>

        {error && (
          <div className="notification is-danger is-light" style={{ marginBottom: '1rem' }}>
            {error}
          </div>
        )}
        {success && (
          <div className="notification is-success is-light" style={{ marginBottom: '1rem' }}>
            {success}
          </div>
        )}

        <div className="tabs">
          <ul>
            <li className={tab === 'members' ? 'is-active' : ''}>
              <a onClick={() => setTab('members')}>Members</a>
            </li>
            {isAdmin && (
              <li className={tab === 'invites' ? 'is-active' : ''}>
                <a onClick={() => setTab('invites')}>Invites</a>
              </li>
            )}
            {isOwner && (
              <li className={tab === 'general' ? 'is-active' : ''}>
                <a onClick={() => setTab('general')}>General</a>
              </li>
            )}
          </ul>
        </div>

        {tab === 'members' && (
          <table className="table is-fullwidth is-striped">
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                {isAdmin && <th />}
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id}>
                  <td>{m.user.username}</td>
                  <td>{m.user.email}</td>
                  <td>
                    {isOwner ? (
                      <div className="select is-small">
                        <select
                          value={m.role}
                          onChange={e => handleRoleChange(m.user.id, e.target.value)}
                        >
                          <option value="owner">Owner</option>
                          <option value="admin">Admin</option>
                          <option value="member">Member</option>
                        </select>
                      </div>
                    ) : (
                      <span className="tag is-light">{m.role}</span>
                    )}
                  </td>
                  {isAdmin && (
                    <td>
                      <button
                        className="button is-small is-danger is-light"
                        onClick={() => handleRemoveMember(m.user.id, m.user.username)}
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'invites' && isAdmin && (
          <div>
            <form onSubmit={handleInvite} className="field has-addons" style={{ marginBottom: '1.5rem' }}>
              <div className="control is-expanded">
                <input
                  className="input"
                  type="email"
                  placeholder="Email address to invite"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  required
                />
              </div>
              <div className="control">
                <button className="button is-primary" type="submit">Send invite</button>
              </div>
            </form>

            {invites.length === 0 ? (
              <p className="has-text-grey">No pending invites.</p>
            ) : (
              <table className="table is-fullwidth">
                <thead>
                  <tr><th>Email</th><th>Invited by</th><th>Sent</th></tr>
                </thead>
                <tbody>
                  {invites.map(inv => (
                    <tr key={inv.id}>
                      <td>{inv.email}</td>
                      <td>{inv.invited_by_username ?? '—'}</td>
                      <td>{new Date(inv.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'general' && isOwner && (
          <div>
            <form onSubmit={handleRename} style={{ marginBottom: '2rem' }}>
              <div className="field">
                <label className="label">Organisation name</label>
                <div className="control">
                  <input
                    className="input"
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    required
                  />
                </div>
              </div>
              <button className="button is-primary" type="submit">Save</button>
            </form>

            <hr />
            <h2 className="subtitle has-text-danger">Danger zone</h2>
            <p className="has-text-grey" style={{ marginBottom: '1rem' }}>
              Deleting an organisation is permanent and removes all members.
            </p>
            <button className="button is-danger" onClick={handleDelete}>
              Delete organisation
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
