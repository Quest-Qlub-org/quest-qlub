import { useNavigate, useLocation } from "react-router-dom";
import { LogoIcon } from "../icons/NavIcons";
import { NAV_ITEMS } from "./navItems";
import imgTitle from "../../assets/brand_title.png";

export function Header() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <header className="sticky top-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm w-full transition-colors">
      <div className="flex items-center justify-center sm:justify-between px-4 md:px-8 py-1.5 max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => navigate("/")}>
          <LogoIcon className="w-8 h-8" />
          <img
            src={imgTitle}
            className="h-7 sm:h-8 object-contain inline-block dark:brightness-0 dark:invert transition-all"
            alt="Quest Qlub"
          />
        </div>
        <div className="hidden sm:flex items-center gap-2">
          {NAV_ITEMS.map((item) => {
            const active = item.isActive(location.pathname);
            const Icon = item.Icon;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors ${
                  active ? "bg-gray-50 dark:bg-gray-800" : ""
                }`}
              >
                <Icon active={active} />
                <span
                  className={`text-sm font-bold ${
                    active ? "text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-300"
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
