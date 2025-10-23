import { Dashboard } from './components/Dashboard';
import { TokenPage } from './components/TokenPage';
import { LandingPage } from './components/LandingPage';
import SnifferIntelligence from './components/SnifferIntelligence';

function App() {
  // Simple routing based on URL path
  const path = window.location.pathname;
  
  // Intelligence Platform route
  if (path === '/intelligence' || path.startsWith('/intelligence/')) {
    return <SnifferIntelligence />;
  }
  
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
