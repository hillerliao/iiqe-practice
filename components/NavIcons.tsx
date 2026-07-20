"use client";

import {
  Home,
  BarChart3,
  Star,
  Settings,
  Monitor,
  XCircle,
} from "lucide-react";
import { ReactNode } from "react";

interface IconProps {
  className?: string;
}

// Export individual icon components to maintain same import style
export const NavXCircle = ({ className }: IconProps) => (
  <XCircle className={className} />
);

export const NavHome = ({ className }: IconProps) => (
  <Home className={className} />
);

export const NavBarChart3 = ({ className }: IconProps) => (
  <BarChart3 className={className} />
);

export const NavStar = ({ className }: IconProps) => (
  <Star className={className} />
);

export const NavSettings = ({ className }: IconProps) => (
  <Settings className={className} />
);

export const NavMonitor = ({ className }: IconProps) => (
  <Monitor className={className} />
);
