'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MemoryView from '@/components/views/MemoryView';

export default function MemoryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is logged in
    const sessionToken = localStorage.getItem('octavius_session');
    const user = localStorage.getItem('octavius_user');
    
    if (!sessionToken || !user) {
      router.push('/login');
      return;
    }

    // Simulate initial data load
    setTimeout(() => setLoading(false), 500);
  }, [router]);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}>
        <div style={{ color: 'white', fontSize: '1.5rem' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', padding: '2rem' }}>
      {/* Top Navigation */}
      <nav style={{
        background: 'white',
        padding: '1rem 2rem',
        borderRadius: '1rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        marginBottom: '2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <a href="/" style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1f2937', textDecoration: 'none' }}>
            🧠 Octavius
          </a>
          <span style={{ color: '#9ca3af' }}>|</span>
          <span style={{ fontWeight: '500', color: '#667eea' }}>Memory</span>
          <span style={{ color: '#9ca3af' }}>|</span>
          <a href="/" style={{ fontWeight: '500', color: '#4b5563', textDecoration: 'none' }}>Dashboard</a>
        </div>
        <button
          onClick={() => {
            localStorage.removeItem('octavius_session');
            localStorage.removeItem('octavius_user');
            router.push('/login');
          }}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '0.5rem',
            border: '1px solid #e5e7eb',
            background: 'white',
            color: '#4b5563',
            cursor: 'pointer',
          }}
        >
          Logout
        </button>
      </nav>

      {/* Memory View Component */}
      <MemoryView />
    </div>
  );
}
