import { GoogleOAuthProvider } from '@react-oauth/google'

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

export default function GoogleProvider({ children }) {
  if (!clientId) return children
  return <GoogleOAuthProvider clientId={clientId}>{children}</GoogleOAuthProvider>
}
