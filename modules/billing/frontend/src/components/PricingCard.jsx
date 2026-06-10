export default function PricingCard({ name, description, amount, currency, interval, priceId, onSubscribe, loading }) {
  const price = amount != null
    ? `${(amount / 100).toFixed(2)} ${currency.toUpperCase()}${interval ? ` / ${interval}` : ''}`
    : 'Free';

  return (
    <div className="card">
      <div className="card-content">
        <p className="title is-4">{name}</p>
        {description && <p className="subtitle is-6">{description}</p>}
        <p className="is-size-3 has-text-weight-bold has-text-primary mb-4">{price}</p>
        <button
          className={`button is-primary is-fullwidth${loading ? ' is-loading' : ''}`}
          disabled={loading}
          onClick={() => onSubscribe(priceId)}
        >
          Subscribe
        </button>
      </div>
    </div>
  );
}
