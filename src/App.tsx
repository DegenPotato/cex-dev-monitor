import { Dashboard } from './components/Dashboard';
import { DevWalletDetail } from './components/DevWalletDetail';

function App() {
  // Simple routing based on URL path
  const path = window.location.pathname;
  
  if (path.startsWith('/dev/')) {
    return <DevWalletDetail />;
  }
  
  return <Dashboard />;
}

export default App;
