import { useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { apiRequest } from "@/integrations/api/client";
import { toast } from "sonner";
import { Link } from "react-router-dom";

interface ReviewFormProps {
  productId: string;
  onSubmitted: () => void;
}

export function ReviewForm({ productId, onSubmitted }: ReviewFormProps) {
  const { user } = useAuth();
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [text, setText] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [loading, setLoading] = useState(false);
  const [userOrders, setUserOrders] = useState<{ id: string; order_number: string }[] | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState("");

  // Check if user has purchased this product
  const checkOrders = async () => {
    if (!user) return;
    const orders = await apiRequest<{ id: string; order_number: string }[]>(
      `/api/reviews/eligible-orders?productId=${productId}`
    );
    setUserOrders(orders || []);
    if (orders.length > 0) setSelectedOrderId(orders[0].id);
  };

  // Load orders on first render if logged in
  useState(() => {
    if (user) checkOrders();
  });

  if (!user) {
    return (
      <div className="bg-secondary rounded-xl p-6 text-center">
        <p className="text-muted-foreground mb-3">Чтобы оставить отзыв, необходимо войти в аккаунт</p>
        <Link to="/auth">
          <Button variant="outline">Войти</Button>
        </Link>
      </div>
    );
  }

  if (userOrders !== null && userOrders.length === 0) {
    return (
      <div className="bg-secondary rounded-xl p-6 text-center">
        <p className="text-muted-foreground">Отзыв можно оставить только после получения товара</p>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!text.trim()) {
      toast.error("Напишите текст отзыва");
      return;
    }
    if (!selectedOrderId) {
      toast.error("Выберите заказ");
      return;
    }

    setLoading(true);
    try {
      await apiRequest("/api/reviews", {
        method: "POST",
        body: JSON.stringify({
          product_id: productId,
          order_id: selectedOrderId,
          rating,
          text: text.trim().slice(0, 2000),
          author_name: authorName.trim().slice(0, 100) || null,
        }),
      });
      toast.success("Отзыв отправлен на модерацию");
      setText("");
      setRating(5);
      setAuthorName("");
      onSubmitted();
    } catch {
      toast.error("Ошибка при отправке отзыва");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-secondary rounded-xl p-6 space-y-4">
      <h3 className="font-heading font-semibold text-lg">Написать отзыв</h3>

      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => setRating(i)}
            onMouseEnter={() => setHoverRating(i)}
            onMouseLeave={() => setHoverRating(0)}
          >
            <Star
              className={`w-6 h-6 transition-colors ${
                i <= (hoverRating || rating) ? "fill-gold text-gold" : "text-muted"
              }`}
            />
          </button>
        ))}
      </div>

      <Input
        placeholder="Ваше имя (необязательно)"
        value={authorName}
        onChange={(e) => setAuthorName(e.target.value)}
        maxLength={100}
      />

      <Textarea
        placeholder="Расскажите о вашем опыте..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        maxLength={2000}
      />

      <Button onClick={handleSubmit} disabled={loading} className="btn-gold">
        {loading ? "Отправка..." : "Отправить отзыв"}
      </Button>
    </div>
  );
}
