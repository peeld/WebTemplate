import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext.jsx';

export default function CartIcon() {
  const { cartCount } = useCart();

  if (cartCount === 0) return null;

  return (
    <Link to="/billing/cart" className="navbar-item" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' , marginRight: '5px', paddingRight: '30px' }}>
      <span role="img" aria-label="Shopping cart" style={{ fontSize: '1.25rem', lineHeight: 1 }}>🛒</span>
      {cartCount > 0 && (
        <span
          className="tag is-primary is-rounded"
          style={{
            position: 'absolute',
            top: '2px',
            right: '12px',
            minWidth: '1.25rem',
            height: '1.25rem',
            fontSize: '0.65rem',
            padding: '0 4px',
            lineHeight: '1.25rem',
          }}
        >
          {cartCount > 99 ? '99+' : cartCount}
        </span>
      )}
    </Link>
  );
}
