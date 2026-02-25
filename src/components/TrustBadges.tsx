import { Shield, Truck, RotateCcw, Headphones } from "lucide-react";

const features = [
  {
    icon: Truck,
    title: "Быстрая доставка",
    description: "По всей России от 1 дня"
  },
  {
    icon: Shield,
    title: "Гарантия качества",
    description: "Оригинальная продукция"
  },
  {
    icon: RotateCcw,
    title: "Контроль качества",
    description: "14 дней на возврат"
  },
  {
    icon: Headphones,
    title: "Поддержка 24/7",
    description: "Всегда на связи"
  }
];

export function TrustBadges() {
  return (
    <section className="py-8 sm:py-12 border-y border-border">
      <div className="container-custom">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <div key={index} className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <feature.icon className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-sm sm:text-base">{feature.title}</h3>
                <p className="text-xs sm:text-sm text-muted-foreground">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
