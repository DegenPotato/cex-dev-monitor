import { Dashboard } from './components/Dashboard';
import { DevWalletDetail } from './components/DevWalletDetail';
import { TokenPage } from './components/TokenPage';
import { LandingPage } from './components/LandingPage';

function App() {
  // Simple routing based on URL path
  const path = window.location.pathname;
  
  // Dashboard routes (under /dashboard)
  if (path.startsWith('/dashboard/dev/')) {
    return <DevWalletDetail />;
  }
  
  if (path.startsWith('/dashboard/token/')) {
    return <TokenPage />;
  }
  
  if (path === '/dashboard' || path.startsWith('/dashboard/')) {
    return <Dashboard />;
  }
  
  // Root path - Landing page
  return <LandingPage />;
}

export default App;
