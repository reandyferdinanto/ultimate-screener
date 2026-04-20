"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Terminal, Activity, Zap, BarChart3, Search, Info, FileText } from "lucide-react";

const NAV_ITEMS = [
  { label: "DASHBOARD", href: "/", icon: Terminal },
  { label: "SCREENER", href: "/screener", icon: Zap },
  { label: "REPORTS", href: "/ai-analyze", icon: FileText },
  { label: "SUMMARY", href: "/summary", icon: Activity },
  { label: "ANALYSIS", href: "/search", icon: Search },
];

export default function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="nav scanline-container" style={{ 
      height: '56px', 
      padding: '0 20px', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'space-between',
      borderBottom: '1px solid var(--border-color)',
      backgroundColor: 'var(--bg-panel)',
      position: 'sticky',
      top: 0,
      zIndex: 1000,
      overflow: 'hidden'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '32px', height: '100%' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px', 
          marginRight: '12px',
          padding: '4px 8px',
          border: '1px solid var(--accent-green)',
          backgroundColor: 'oklch(0.82 0.18 145 / 0.05)'
        }}>
          <div style={{ width: '8px', height: '8px', backgroundColor: 'var(--accent-green)', borderRadius: '50%', animation: 'pulse 2s infinite' }}></div>
          <span style={{ 
            fontSize: '0.75rem', 
            fontWeight: '800', 
            letterSpacing: '0.15em', 
            color: 'var(--accent-green)',
            textShadow: '0 0 10px oklch(0.82 0.18 145 / 0.3)'
          }}>
            SYSTEM_v0.1
          </span>
        </div>

        <div style={{ display: 'flex', gap: '4px', height: '100%' }}>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            
            return (
              <Link 
                key={item.href} 
                href={item.href} 
                className={`nav-link ${isActive ? 'active' : ''}`}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px', 
                  padding: '0 16px',
                  height: '100%',
                  fontSize: '0.65rem',
                  fontWeight: '700',
                  letterSpacing: '0.1em',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  position: 'relative',
                  color: isActive ? 'var(--accent-green)' : 'var(--text-secondary)',
                  borderBottom: '2px solid transparent',
                  borderBottomColor: isActive ? 'var(--accent-green)' : 'transparent',
                }}
              >
                <Icon size={14} style={{ opacity: isActive ? 1 : 0.6 }} />
                <span className="mobile-hide">{item.label}</span>
                {isActive && (
                  <div style={{ 
                    position: 'absolute', 
                    bottom: '0', 
                    left: '0', 
                    width: '100%', 
                    height: '100%', 
                    background: 'linear-gradient(to top, oklch(0.82 0.18 145 / 0.05), transparent)',
                    pointerEvents: 'none'
                  }}></div>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontWeight: '600' }}>DATA_STATUS</span>
          <span style={{ fontSize: '0.65rem', color: 'var(--accent-green)', fontWeight: '800' }}>LIVE_CONNECTED</span>
        </div>
        <Link href="/settings" style={{ color: 'var(--text-secondary)', transition: 'color 0.2s' }} className="hover-green">
           <Info size={16} />
        </Link>
      </div>

      <style jsx>{`
        .nav-link:hover {
          color: var(--text-primary) !important;
          background-color: oklch(1 0 0 / 0.03);
        }
        .hover-green:hover {
          color: var(--accent-green) !important;
        }
        @keyframes pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </nav>
  );
}
