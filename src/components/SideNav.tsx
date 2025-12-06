import { useState } from "react";
import { NavLink } from "@/components/NavLink";
import { Package, Image, Award, Info, Mail, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoGD from "@/assets/logo-gd-no-bg.png";
import { Link } from "react-router-dom";

const navItems = [
  { to: "/products", label: "Products", icon: Package },
  // { to: "/gallery", label: "Our Factory", icon: Image },
  { to: "/quality", label: "Quality", icon: Award },
  { to: "/about", label: "About", icon: Info },
  { to: "/contact", label: "Contact", icon: Mail },
];

export const SideNav = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Mobile Menu Button - Static on mobile, fixed on desktop */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute md:fixed top-4 left-4 z-50 md:z-50 md:hidden bg-background/80 backdrop-blur-sm"
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </Button>

      {/* Side Navigation */}
      <nav
        className={`fixed left-0 top-0 h-full bg-card/95 backdrop-blur-sm border-r border-border z-40 transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } w-20 flex flex-col items-center py-8 gap-6`}
      >
        {/* Logo at top */}
        <Link to="/" className="cursor-pointer hover:opacity-80 transition-opacity">
          <img src={logoGD} alt="GD Logo" className="w-12 h-12 object-contain mix-blend-multiply opacity-90" />
        </Link>
        
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className="group relative flex items-center justify-center w-12 h-12 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-all"
            activeClassName="text-foreground bg-accent/20"
          >
            <item.icon className="h-5 w-5" />
            <span className="absolute left-full ml-4 px-2 py-1 bg-card text-foreground text-sm rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap border border-border">
              {item.label}
            </span>
          </NavLink>
        ))}
      </nav>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
};
