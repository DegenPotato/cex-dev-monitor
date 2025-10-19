import { Dashboard } from './components/Dashboard';
import { TokenPage } from './components/TokenPage';
import { LandingPage } from './components/LandingPage';

function App() {
  // Simple routing based on URL path
  const path = window.location.pathname;
  
  // Token page route (under /dashboard/token)
  if (path.startsWith('/dashboard/token/')) {
    return <TokenPage />;
  }
  
  // Dashboard route
  if (path === '/dashboard' || path.startsWith('/dashboard/')) {
    return <Dashboard />;
  }
  
  // Root path - Landing page
  return <LandingPage />;
}

export default App;
