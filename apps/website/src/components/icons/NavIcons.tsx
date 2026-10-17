import imgLogo from "../../assets/brand_logo.jpg";
import imgHome from "../../assets/nav_home.png";
import imgSearch from "../../assets/nav_search.png";
import imgUser from "../../assets/nav_user.png";
import imgStar from "../../assets/nav_star.png";
import imgSettings from "../../assets/nav_settings.png";

export const LogoIcon = ({ className = "w-8 h-8" }: { className?: string }) => (
  <img src={imgLogo} className={`${className} object-cover rounded`} alt="Logo" />
);

export const CustomHomeIcon = ({
  className = "w-6 h-6",
  active = false,
}: {
  className?: string;
  active?: boolean;
}) => (
  <img
    src={imgHome}
    className={`${className} object-contain rounded-full ${active ? "ring-2 ring-blue-500" : ""}`}
    alt="Home"
  />
);

export const CustomSearchIcon = ({
  className = "w-6 h-6",
  active = false,
}: {
  className?: string;
  active?: boolean;
}) => (
  <img
    src={imgSearch}
    className={`${className} object-contain rounded-full ${active ? "ring-2 ring-blue-500" : ""}`}
    alt="Search"
  />
);

export const CustomUserIcon = ({
  className = "w-6 h-6",
  active = false,
}: {
  className?: string;
  active?: boolean;
}) => (
  <img
    src={imgUser}
    className={`${className} object-contain rounded-full ${active ? "ring-2 ring-blue-500" : ""}`}
    alt="User"
  />
);

export const CustomStarIcon = ({
  className = "w-6 h-6",
  active = false,
}: {
  className?: string;
  active?: boolean;
}) => (
  <img
    src={imgStar}
    className={`${className} object-contain rounded-full ${active ? "ring-2 ring-yellow-400" : ""}`}
    alt="Star"
  />
);

export const CustomSettingsIcon = ({
  className = "w-6 h-6",
  active = false,
}: {
  className?: string;
  active?: boolean;
}) => (
  <img
    src={imgSettings}
    className={`${className} object-contain rounded-full ${active ? "ring-2 ring-gray-400" : ""}`}
    alt="Settings"
  />
);
