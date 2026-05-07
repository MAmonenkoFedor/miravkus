import { Link } from "react-router-dom";
import { MapPin, Phone, Mail, Clock } from "lucide-react";
import logo from "@/assets/logo.png";
import { useCategories } from "@/hooks/useProducts";

export function Footer() {
  const { data: categories = [] } = useCategories();

  return (
    <footer className="bg-primary text-primary-foreground mt-auto">
      <div className="container-custom py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <img src={logo} alt="МираВкус" className="w-12 h-12 object-contain brightness-0 invert" />
              <div>
                <h3 className="font-heading font-bold text-lg">МираВкус</h3>
                <p className="text-xs text-primary-foreground/70">Азиатские сладости</p>
              </div>
            </div>
            <p className="text-sm text-primary-foreground/80 leading-relaxed">
              ИП Люблинский А. А.<br />
              ИНН: 504011882700 | ОГРН: 321774600492476
            </p>
          </div>

          {/* Catalog */}
          <div className="space-y-4">
            <h4 className="font-heading font-semibold text-base">Каталог</h4>
            <ul className="space-y-2 text-sm text-primary-foreground/80">
              {categories.map((category) => (
                <li key={category.id}>
                  <Link to={`/catalog?category=${category.slug}`} className="hover:text-gold transition-colors">
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Info */}
          <div className="space-y-4">
            <h4 className="font-heading font-semibold text-base">Информация</h4>
            <ul className="space-y-2 text-sm text-primary-foreground/80">
              <li><Link to="/page/o-kompanii" className="hover:text-gold transition-colors">О компании</Link></li>
              <li><Link to="/page/dostavka-i-oplata" className="hover:text-gold transition-colors">Доставка и оплата</Link></li>
              <li><Link to="/page/vozvrat-tovara" className="hover:text-gold transition-colors">Возврат товара</Link></li>
              <li><Link to="/page/privacy" className="hover:text-gold transition-colors">Политика конфиденциальности</Link></li>
              <li><Link to="/page/usloviya-ispolzovaniya" className="hover:text-gold transition-colors">Условия использования</Link></li>
            </ul>
          </div>

          {/* Contacts */}
          <div className="space-y-4">
            <h4 className="font-heading font-semibold text-base">Контакты</h4>
            <ul className="space-y-3 text-sm text-primary-foreground/80">
              <li className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-gold" />
                <a href="tel:+74951281501" className="hover:text-gold transition-colors">8 (495) 128-15-01</a>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-gold" />
                <a href="mailto:Miravcus@yandex.ru" className="hover:text-gold transition-colors">Miravcus@yandex.ru</a>
              </li>
              <li className="flex items-start gap-2">
                <Clock className="w-4 h-4 text-gold mt-0.5" />
                <span>Пн-Пт: 9:00 - 20:00<br />Сб-Вс: 10:00 - 18:00</span>
              </li>
            </ul>
            
            {/* Social */}
            <div className="flex gap-3 pt-2">
              <a href="#" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-gold transition-colors">
                <span className="text-sm font-bold">VK</span>
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-gold transition-colors">
                <span className="text-sm font-bold">TG</span>
              </a>
              <a href="#" className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-gold transition-colors">
                <span className="text-sm font-bold">WA</span>
              </a>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-10 pt-6 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs text-primary-foreground/60">
          <p>© {new Date().getFullYear()} ИП Люблинский А. А. Все права защищены.</p>
          <div className="flex items-center gap-4">
            <span>💳 Безопасная оплата</span>
            <span>🔒 SSL защита</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
