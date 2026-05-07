import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

interface PromoBannerProps {
  title: string;
  subtitle: string;
  discount?: string;
  linkUrl: string;
  linkText: string;
  variant?: "red" | "gold";
}

export function PromoBanner({ 
  title, 
  subtitle, 
  discount, 
  linkUrl, 
  linkText,
  variant = "red" 
}: PromoBannerProps) {
  const isRed = variant === "red";
  
  return (
    <Link 
      to={linkUrl}
      className={`block rounded-2xl overflow-hidden transition-transform hover:scale-[1.02] ${
        isRed ? 'bg-destructive' : 'bg-gradient-to-r from-gold to-gold-light'
      }`}
    >
      <div className="p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-center sm:text-left">
          {discount && (
            <span className={`text-4xl sm:text-5xl font-heading font-bold ${
              isRed ? 'text-white' : 'text-white'
            }`}>
              {discount}
            </span>
          )}
          <h3 className={`font-heading font-bold text-xl sm:text-2xl mt-2 ${
            isRed ? 'text-white' : 'text-white'
          }`}>
            {title}
          </h3>
          <p className={`text-sm sm:text-base mt-1 ${
            isRed ? 'text-white/80' : 'text-white/80'
          }`}>
            {subtitle}
          </p>
        </div>
        
        <div className={`flex items-center gap-2 font-semibold ${
          isRed ? 'text-white' : 'text-white'
        }`}>
          {linkText}
          <ArrowRight className="w-5 h-5" />
        </div>
      </div>
    </Link>
  );
}
