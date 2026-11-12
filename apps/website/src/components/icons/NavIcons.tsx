import imgLogo from "../../assets/brand_logo.jpg";
import imgHome from "../../assets/nav_home.png";
import imgSearch from "../../assets/nav_search.png";
import imgUser from "../../assets/nav_user.png";
import imgStar from "../../assets/nav_star.png";
import imgSettings from "../../assets/nav_settings.png";

function DecorativeNavIcon({
  src,
  className = "w-6 h-6",
  active = false,
  activeRingClass,
}: {
  src: string;
  className?: string;
  active?: boolean;
  activeRingClass: string;
}) {
  return (
    <img
      src={src}
      className={`${className} object-contain rounded-full ${active ? activeRingClass : ""}`}
      alt=""
      aria-hidden="true"
    />
  );
}

export const LogoIcon = ({ className = "w-8 h-8" }: { className?: string }) => (
  <img src={imgLogo} className={`${className} object-cover rounded`} alt="" aria-hidden="true" />
);

export const CustomHomeIcon = ({
  className = "w-6 h-6",
  active = false,
}: {
  className?: string;
  active?: boolean;
}) => (
  <DecorativeNavIcon
    src={imgHome}
    className={className}
    active={active}
    activeRingClass="ring-2 ring-blue-500"
  />
);

export const CustomSearchIcon = ({
  className = "w-6 h-6",
  active = false,
}: {
  className?: string;
  active?: boolean;
}) => (
  <DecorativeNavIcon
    src={imgSearch}
    className={className}
    active={active}
    activeRingClass="ring-2 ring-blue-500"
  />
);

export const CustomUserIcon = ({
  className = "w-6 h-6",
  active = false,
}: {
  className?: string;
  active?: boolean;
}) => (
  <DecorativeNavIcon
    src={imgUser}
    className={className}
    active={active}
    activeRingClass="ring-2 ring-blue-500"
  />
);

export const CustomStarIcon = ({
  className = "w-6 h-6",
  active = false,
}: {
  className?: string;
  active?: boolean;
}) => (
  <DecorativeNavIcon
    src={imgStar}
    className={className}
    active={active}
    activeRingClass="ring-2 ring-yellow-400"
  />
);

export const CustomSettingsIcon = ({
  className = "w-6 h-6",
  active = false,
}: {
  className?: string;
  active?: boolean;
}) => (
  <DecorativeNavIcon
    src={imgSettings}
    className={className}
    active={active}
    activeRingClass="ring-2 ring-gray-400"
  />
);
