import { Star } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface Review {
  id: string;
  rating: number;
  text: string;
  author_name: string | null;
  created_at: string;
}

export function ReviewsList({ reviews }: { reviews: Review[] }) {
  if (reviews.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-6">Пока нет отзывов. Будьте первым!</p>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {reviews.map((review) => (
        <div key={review.id} className="bg-card rounded-xl p-4 shadow-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
              <span className="font-semibold">{(review.author_name || "А")[0].toUpperCase()}</span>
            </div>
            <div>
              <p className="font-medium text-sm">{review.author_name || "Покупатель"}</p>
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, j) => (
                  <Star key={j} className={`w-3 h-3 ${j < review.rating ? "fill-gold text-gold" : "text-muted"}`} />
                ))}
              </div>
            </div>
            <span className="ml-auto text-xs text-muted-foreground">
              {format(new Date(review.created_at), "dd MMM yyyy", { locale: ru })}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{review.text}</p>
        </div>
      ))}
    </div>
  );
}
