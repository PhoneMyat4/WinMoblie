import React from 'react';
import { AppTab } from '../../types';

export interface AppLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  tab?: AppTab;
  toTab?: (tab: AppTab) => void;
  openInNewTab?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * AppLink Component
 * A semantic HTML <a> anchor that guarantees full browser native context menus:
 * - Right-Click: "Open link in new tab", "Open link in new window", "Open in Incognito", "Copy link"
 * - Middle-Click (Wheel) or Ctrl/Cmd+Click: Natively opens in a new tab
 * - Standard Left-Click: Performs smooth internal SPA tab navigation without full page reload
 */
export const AppLink: React.FC<AppLinkProps> = ({
  tab,
  toTab,
  openInNewTab = false,
  href,
  onClick,
  className = '',
  children,
  ...props
}) => {
  const targetHref = href || (tab ? `?tab=${tab}` : '#');

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onClick) {
      onClick(e);
    }

    if (openInNewTab) {
      // Allow browser target="_blank" to handle naturally
      return;
    }

    // If it's a standard unmodified left-click (not Cmd+click, Ctrl+click, Shift+click, Alt+click or wheel)
    if (
      !e.defaultPrevented &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.shiftKey &&
      !e.altKey &&
      e.button === 0
    ) {
      if (tab && toTab) {
        e.preventDefault();
        toTab(tab);
      }
    }
  };

  return (
    <a
      href={targetHref}
      target={openInNewTab ? '_blank' : undefined}
      rel={openInNewTab ? 'noopener noreferrer' : undefined}
      onClick={handleClick}
      className={className}
      {...props}
    >
      {children}
    </a>
  );
};
