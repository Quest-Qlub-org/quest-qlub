import { useNavigate, useLocation } from "react-router-dom";
import { NAV_ITEMS } from "./navItems";

export function MobileNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex items-center justify-around pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 z-50 transition-colors">
      {NAV_ITEMS.map((item) => {
        const active = item.isActive(location.pathname);
        const Icon = item.Icon;
        return (
          <button
            key={item.id}
            onClick={() => navigate(item.path)}
            className="flex flex-col items-center justify-center gap-1 w-16"
          >
            <Icon active={active} />
            <span
              className={`text-[10px] ${
                active
                  ? "text-blue-600 dark:text-blue-400 font-bold"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
