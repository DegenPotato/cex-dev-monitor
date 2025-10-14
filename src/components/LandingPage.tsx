import { BlackholeScene } from './landing/BlackholeScene';

export function LandingPage() {
  const handleEnter = () => {
    // Redirect to dashboard
    window.location.href = '/dashboard';
  };

  return (
    <main className="w-screen h-screen bg-black">
      <BlackholeScene onEnter={handleEnter} />
    </main>
  );
}
