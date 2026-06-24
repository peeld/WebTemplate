import { createContext, useContext, useEffect, useState } from 'react';

const CartContext = createContext(null);
const STORAGE_KEY = 'billing_cart';

function loadCart() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(loadCart);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  function addToCart(product, price) {
    setItems(prev => {
      const existing = prev.find(i => i.price.stripe_price_id === price.stripe_price_id);
      if (existing) {
        if (price.price_type === 'recurring') return prev; // subscriptions are always qty 1
        return prev.map(i =>
          i.price.stripe_price_id === price.stripe_price_id
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [...prev, { product, price, quantity: 1 }];
    });
  }

  function removeFromCart(priceId) {
    setItems(prev => prev.filter(i => i.price.stripe_price_id !== priceId));
  }

  function updateQuantity(priceId, qty) {
    if (qty < 1) { removeFromCart(priceId); return; }
    setItems(prev =>
      prev.map(i =>
        i.price.stripe_price_id === priceId ? { ...i, quantity: qty } : i
      )
    );
  }

  function clearCart() {
    setItems([]);
  }

  const cartCount       = items.reduce((sum, i) => sum + i.quantity, 0);
  const oneTimeItems    = items.filter(i => i.price.price_type === 'one_time');
  const subscriptionItems = items.filter(i => i.price.price_type === 'recurring');
  const cartTotal       = oneTimeItems.reduce((sum, i) => sum + i.price.amount * i.quantity, 0);

  return (
    <CartContext.Provider value={{
      items,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      cartCount,
      cartTotal,
      oneTimeItems,
      subscriptionItems,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
