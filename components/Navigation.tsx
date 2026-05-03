"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type IconProps = {
  size?: number;
  style?: React.CSSProperties;
};

function IconBase({ size = 14, style, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function TerminalIcon(props: IconProps) {
  return <IconBase {...props}><path d="m4 17 6-6-6-6" /><path d="M12 19h8" /></IconBase>;
}

function ZapIcon(props: IconProps) {
  return <IconBase {...props}><path d="M13 2 3 14h8l-1 8 10-12h-8l1-8Z" /></IconBase>;
}

function BreakoutIcon(props: IconProps) {
  return <IconBase {...props}><path d="M3 17 9 11l4 4 8-8" /><path d="M14 7h7v7" /></IconBase>;
}

function SearchIcon(props: IconProps) {
  return <IconBase {...props}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></IconBase>;
}

function ResearchIcon(props: IconProps) {
  return <IconBase {...props}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z" /><path d="M8 7h8" /><path d="M8 11h6" /></IconBase>;
}

function InfoIcon(props: IconProps) {
  return <IconBase {...props}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></IconBase>;
}

const NAV_ITEMS = [
  { label: "DASHBOARD", href: "/", icon: TerminalIcon },
  { label: "SCREENER", href: "/screener", icon: ZapIcon },
  { label: "BREAKOUT", href: "/silent-flyer", icon: BreakoutIcon },
  { label: "ANALYSIS", href: "/search", icon: SearchIcon },
  { label: "RESEARCH", href: "/research", icon: ResearchIcon },
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
      <div className="nav-content" style={{ display: 'flex', alignItems: 'center', gap: '32px', height: '100%' }}>
        <div className="nav-brand" style={{ 
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

        <div className="nav-items" style={{ display: 'flex', gap: '4px', height: '100%' }}>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
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

      <div className="nav-status" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontWeight: '600' }}>DATA_STATUS</span>
          <span style={{ fontSize: '0.65rem', color: 'var(--accent-green)', fontWeight: '800' }}>LIVE_CONNECTED</span>
        </div>
        <Link href="/settings" style={{ color: 'var(--text-secondary)', transition: 'color 0.2s' }} className="hover-green">
           <InfoIcon size={16} />
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
        @media (max-width: 900px) {
          .nav {
            position: fixed !important;
            top: auto !important;
            bottom: 0;
            left: 0;
            right: 0;
            height: calc(64px + env(safe-area-inset-bottom)) !important;
            padding: 0 10px env(safe-area-inset-bottom) !important;
            border-top: 1px solid var(--border-color);
            border-bottom: 0 !important;
          }
          .nav-content {
            width: 100%;
            gap: 8px !important;
            min-width: 0;
          }
          .nav-brand {
            display: none !important;
          }
          .nav-items {
            width: 100%;
            display: grid !important;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 2px !important;
          }
          .nav-link {
            min-height: 52px;
            justify-content: center;
            padding: 0 6px !important;
            flex-direction: column;
            gap: 4px !important;
            font-size: 0.55rem !important;
            letter-spacing: 0.04em !important;
          }
          .nav-link svg {
            width: 17px;
            height: 17px;
          }
          .nav-status {
            display: none !important;
          }
          .mobile-hide {
            display: inline !important;
          }
        }
        @media (max-width: 420px) {
          .nav-link {
            font-size: 0.46rem !important;
            padding: 0 2px !important;
          }
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
