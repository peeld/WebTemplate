import { Link } from 'react-router-dom'
import { useOrg } from '../context/OrgContext'

export default function OrgSwitcher() {
  const { orgs, activeOrg, switchOrg } = useOrg()

  return (

    <div className="card"  style={{ width: '100%' }}>
      <header className="card-header">
        <p className="card-header-title">Organization</p>
      </header>
      <div className="card-content">
      {orgs.length === 0 ? (
        <p className="has-text-grey is-size-7 mb-3">You're not in any organization yet.</p>
      ) : (
        <ul className="mb-3">
          {orgs.map(org => {
            const isActive = activeOrg?.id === org.id
            return (
              <li key={org.id} className="mb-1">
                <button
                  className={`button is-fullwidth is-justify-content-flex-start${isActive ? ' is-primary is-light' : ' is-white'}`}
                  onClick={() => switchOrg(org)}
                  disabled={isActive}
                >
                  {org.name}
                  {isActive && <span className="tag is-primary is-light ml-auto">active</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}

        {activeOrg && (
          <Link className="button is-small is-light" to={`/orgs/${activeOrg.id}/settings`}>
            Organization settings
          </Link>
        )}
        <Link className="button is-small is-primary" to="/orgs/new">
          + New organization
        </Link>
      </div>
    </div>
  )
}
