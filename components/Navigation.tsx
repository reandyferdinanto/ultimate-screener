"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type IconProps = {
  size?: number;
  style?: React.CSSProperties;
};

type NavItem = {
  label: string;
  shortLabel: string;
  href: string;
  icon: (props: IconProps) => React.ReactElement;
  mobilePrimary?: boolean;
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

function GuideIcon(props: IconProps) {
  return <IconBase {...props}><path d="M12 6v12" /><path d="M8 8h8" /><path d="M8 12h8" /><path d="M8 16h5" /><rect x="4" y="3" width="16" height="18" rx="2" /></IconBase>;
}

function InfoIcon(props: IconProps) {
  return <IconBase {...props}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></IconBase>;
}

function MoreIcon(props: IconProps) {
  return <IconBase {...props}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></IconBase>;
}

function SettingsIcon(props: IconProps) {
  return <IconBase {...props}><circle cx="12" cy="12" r="3" /><path d="M12 2v3" /><path d="M12 19v3" /><path d="m4.93 4.93 2.12 2.12" /><path d="m16.95 16.95 2.12 2.12" /><path d="M2 12h3" /><path d="M19 12h3" /><path d="m4.93 19.07 2.12-2.12" /><path d="m16.95 7.05 2.12-2.12" /></IconBase>;
}

const NAV_ITEMS: NavItem[] = [
  { label: "DASHBOARD", shortLabel: "Home", href: "/", icon: TerminalIcon, mobilePrimary: true },
  { label: "SCREENER", shortLabel: "Screener", href: "/screener", icon: ZapIcon, mobilePrimary: true },
  { label: "BREAKOUT", shortLabel: "Breakout", href: "/silent-flyer", icon: BreakoutIcon, mobilePrimary: true },
  { label: "ANALYSIS", shortLabel: "Analyze", href: "/search", icon: SearchIcon, mobilePrimary: true },
  { label: "RESEARCH", shortLabel: "Research", href: "/research", icon: ResearchIcon },
  { label: "GUIDE", shortLabel: "Guide", href: "/guide", icon: GuideIcon },
];

const MOBILE_MORE_ITEMS: NavItem[] = [
  ...NAV_ITEMS.filter(item => !item.mobilePrimary),
  { label: "SETTINGS", shortLabel: "Settings", href: "/settings", icon: SettingsIcon },
];

function isActivePath(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

export default function Navigation() {
  const pathname = usePathname();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const mobilePrimaryItems = NAV_ITEMS.filter(item => item.mobilePrimary);
  const isMoreActive = MOBILE_MORE_ITEMS.some(item => isActivePath(pathname, item.href));

  useEffect(() => {
    setIsMoreOpen(false);
  }, [pathname]);

  return (
    <nav className="nav scanline-container" style={{
      height: "56px",
      padding: "0 20px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottom: "1px solid var(--border-color)",
      backgroundColor: "var(--bg-panel)",
      position: "sticky",
      top: 0,
      zIndex: 1000,
      overflow: "hidden"
    }}>
      <div className="nav-content" style={{ display: "flex", alignItems: "center", gap: "32px", height: "100%" }}>
        <div className="nav-brand" style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginRight: "12px",
          padding: "4px 8px",
          border: "1px solid var(--accent-green)",
          backgroundColor: "oklch(0.82 0.18 145 / 0.05)"
        }}>
          <div style={{ width: "8px", height: "8px", backgroundColor: "var(--accent-green)", borderRadius: "50%", animation: "pulse 2s infinite" }} />
          <span style={{
            fontSize: "0.75rem",
            fontWeight: "800",
            letterSpacing: "0.15em",
            color: "var(--accent-green)",
            textShadow: "0 0 10px oklch(0.82 0.18 145 / 0.3)"
          }}>
            SYSTEM_v0.1
          </span>
        </div>

        <div className="nav-items" style={{ display: "flex", gap: "4px", height: "100%" }}>
          {NAV_ITEMS.map((item) => {
            const isActive = isActivePath(pathname, item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${isActive ? "active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "0 16px",
                  height: "100%",
                  fontSize: "0.65rem",
                  fontWeight: "700",
                  letterSpacing: "0.1em",
                  transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  position: "relative",
                  color: isActive ? "var(--accent-green)" : "var(--text-secondary)",
                  borderBottom: "2px solid transparent",
                  borderBottomColor: isActive ? "var(--accent-green)" : "transparent",
                }}
              >
                <Icon size={14} style={{ opacity: isActive ? 1 : 0.6 }} />
                <span className="mobile-hide">{item.label}</span>
                {isActive && (
                  <div style={{
                    position: "absolute",
                    bottom: "0",
                    left: "0",
                    width: "100%",
                    height: "100%",
                    background: "linear-gradient(to top, oklch(0.82 0.18 145 / 0.05), transparent)",
                    pointerEvents: "none"
                  }} />
                )}
              </Link>
            );
          })}
        </div>

        <div className="mobile-nav-items" aria-label="Primary mobile navigation">
          {mobilePrimaryItems.map((item) => {
            const isActive = isActivePath(pathname, item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`mobile-nav-link ${isActive ? "active" : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon size={18} />
                <span>{item.shortLabel}</span>
              </Link>
            );
          })}

          <button
            type="button"
            className={`mobile-nav-link ${isMoreActive || isMoreOpen ? "active" : ""}`}
            aria-expanded={isMoreOpen}
            aria-controls="mobile-more-menu"
            onClick={() => setIsMoreOpen(open => !open)}
          >
            <MoreIcon size={18} />
            <span>More</span>
          </button>
        </div>
      </div>

      {isMoreOpen && (
        <div className="mobile-more-panel" id="mobile-more-menu" aria-label="More navigation">
          {MOBILE_MORE_ITEMS.map((item) => {
            const isActive = isActivePath(pathname, item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`mobile-more-link ${isActive ? "active" : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon size={17} />
                <span>{item.shortLabel}</span>
              </Link>
            );
          })}
        </div>
      )}

      <div className="nav-status" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <span style={{ fontSize: "0.6rem", color: "var(--text-secondary)", fontWeight: "600" }}>DATA_STATUS</span>
          <span style={{ fontSize: "0.65rem", color: "var(--accent-green)", fontWeight: "800" }}>LIVE_CONNECTED</span>
        </div>
        <Link href="/settings" style={{ color: "var(--text-secondary)", transition: "color 0.2s" }} className="hover-green" aria-label="Settings">
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
        .mobile-nav-items,
        .mobile-more-panel {
          display: none;
        }
        @media (max-width: 900px) {
          .nav {
            position: fixed !important;
            top: auto !important;
            bottom: 0;
            left: 0;
            right: 0;
            height: calc(68px + env(safe-area-inset-bottom)) !important;
            padding: 0 10px env(safe-area-inset-bottom) !important;
            border-top: 1px solid var(--border-color);
            border-bottom: 0 !important;
            overflow: visible !important;
          }
          .nav-content {
            width: 100%;
            gap: 8px !important;
            min-width: 0;
          }
          .nav-brand,
          .nav-items,
          .nav-status {
            display: none !important;
          }
          .mobile-nav-items {
            width: 100%;
            height: 100%;
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 4px;
          }
          .mobile-nav-link {
            min-height: 56px;
            border: 0;
            border-radius: 16px;
            background: transparent;
            color: var(--text-secondary);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            gap: 4px;
            font: inherit;
            font-size: 0.58rem;
            font-weight: 800;
            letter-spacing: 0.02em;
            text-decoration: none;
            touch-action: manipulation;
            transition: color 0.18s ease, background-color 0.18s ease, transform 0.18s ease;
          }
          .mobile-nav-link svg {
            opacity: 0.72;
          }
          .mobile-nav-link.active {
            color: var(--accent-green);
            background: oklch(0.82 0.18 145 / 0.09);
          }
          .mobile-nav-link.active svg {
            opacity: 1;
          }
          .mobile-nav-link:active {
            transform: translateY(1px) scale(0.98);
          }
          .mobile-more-panel {
            position: fixed;
            left: 10px;
            right: 10px;
            bottom: calc(78px + env(safe-area-inset-bottom));
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
            padding: 10px;
            border: 1px solid var(--border-color);
            border-radius: 20px;
            background: color-mix(in oklch, var(--bg-panel) 94%, black 6%);
            box-shadow: 0 -18px 40px oklch(0 0 0 / 0.42);
          }
          .mobile-more-link {
            min-height: 50px;
            border-radius: 14px;
            color: var(--text-secondary);
            background: oklch(1 0 0 / 0.025);
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 7px;
            font-size: 0.68rem;
            font-weight: 800;
            text-decoration: none;
          }
          .mobile-more-link.active {
            color: var(--accent-green);
            background: oklch(0.82 0.18 145 / 0.09);
          }
          .mobile-hide {
            display: inline !important;
          }
        }
        @media (max-width: 420px) {
          .mobile-nav-link {
            font-size: 0.52rem;
            border-radius: 14px;
          }
          .mobile-more-panel {
            grid-template-columns: 1fr;
          }
          .mobile-more-link {
            justify-content: flex-start;
            padding: 0 14px;
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
