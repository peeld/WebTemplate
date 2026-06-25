export default function HelloWorldPage() {
  return (
    <section className="section">
      <div className="container">
        <h1 className="title">Hello World</h1>
        <p className="subtitle">This is a page stub from the <strong>helloworld</strong> module.</p>

        <div className="box">
          <p className="content">
            Replace this component with your module&rsquo;s actual page content. A few conventions to follow:
          </p>
          <ul className="content">
            <li>Keep all API calls in <code>api.js</code> — no inline <code>fetch</code> in components.</li>
            <li>Use Bulma classes for layout and styling.</li>
            <li>Export this page from <code>routes.jsx</code> and list the nav entry in <code>navItems</code>.</li>
          </ul>
        </div>

        <div className="notification is-info is-light">
          This page is registered at <code>/helloworld</code> via <code>routes.jsx</code> and linked in the navbar via <code>navItems</code> in <code>index.js</code>.
        </div>
      </div>
    </section>
  );
}
