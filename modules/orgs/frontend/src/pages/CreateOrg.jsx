import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { orgsApi } from '../api'
import { useOrg } from '../context/OrgContext'

export default function CreateOrg() {
  const [name, setName] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { refreshOrgs, switchOrg } = useOrg()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await orgsApi.create({ name: name.trim() })
      if (!res.ok) {
        const data = await res.json()
        setError(data.name?.[0] || data.error || 'Failed to create organisation.')
        return
      }
      const org = await res.json()
      await refreshOrgs()
      switchOrg(org)
      navigate(`/orgs/${org.id}/settings`)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 480 }}>
        <h1 className="title">Create organisation</h1>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label className="label">Name</label>
            <div className="control">
              <input
                className="input"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Acme Corp"
                required
                autoFocus
              />
            </div>
          </div>
          {error && <p className="help is-danger">{error}</p>}
          <div className="field" style={{ marginTop: '1rem' }}>
            <div className="control">
              <button
                className="button is-primary"
                type="submit"
                disabled={loading || !name.trim()}
              >
                {loading ? 'Creating…' : 'Create organisation'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  )
}
