import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Star, Heart, ShoppingCart, Minus, Plus, Truck, RotateCcw, Shield, ChevronRight } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ProductCarousel } from "@/components/ProductCarousel";
import { ReviewForm } from "@/components/ReviewForm";
import { ReviewsList } from "@/components/ReviewsList";
import { Button } from "@/components/ui/button";
import { useCart } from "@/context/CartContext";
import { useFavorites } from "@/context/FavoritesContext";
import { useProductBySlugOrId, useProducts, useCategories } from "@/hooks/useProducts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/integrations/api/client";
import { toast } from "sonner";
import { SEO } from "@/components/SEO";
import { ProductJsonLd } from "@/components/ProductJsonLd";
import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const ProductDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { data: product, isLoading, error } = useProductBySlugOrId(id);
  const { data: allProducts = [] } = useProducts();
  const { data: categories = [] } = useCategories();
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(0);
  
  const { addToCart } = useCart();
  const { addToFavorites, removeFromFavorites, isFavorite } = useFavorites();

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!product || error) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4">😔</div>
            <h1 className="font-heading font-bold text-2xl mb-2">Товар не найден</h1>
            <Link to="/catalog" className="text-primary hover:underline">
              Вернуться в каталог
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const favorite = isFavorite(product.id);
  const relatedProducts = allProducts.filter(p => p.category === product.category && p.id !== product.id);
  const categoryName = categories.find((c) => c.slug === product.category)?.name || product.category;

  const images = product.images && product.images.length > 0
    ? product.images
    : [product.image];
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const productUrl = `${baseUrl}/product/${product.slug || product.id}`;

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("ru-RU").format(price) + " ₽";
  };

  const handleAddToCart = () => {
    for (let i = 0; i < quantity; i++) {
      addToCart(product);
    }
    toast.success(`Добавлено в корзину: ${quantity} шт.`, {
      description: product.name,
    });
  };

  const handleToggleFavorite = () => {
    if (favorite) {
      removeFromFavorites(product.id);
      toast.info("Удалено из избранного");
    } else {
      addToFavorites(product);
      toast.success("Добавлено в избранное");
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <SEO
        title={product.meta_title || product.name}
        description={product.meta_description || product.description || `${product.name} — купить с доставкой`}
        keywords={product.meta_keywords || undefined}
        image={images[0]}
        type="product"
        url={productUrl}
      />
      <ProductJsonLd product={product} />
      <BreadcrumbJsonLd items={[
        { name: "Главная", url: baseUrl },
        { name: "Каталог", url: `${baseUrl}/catalog` },
        ...(product.category ? [{ name: categoryName, url: `${baseUrl}/catalog?category=${product.category}` }] : []),
        { name: product.name, url: productUrl },
      ]} />
      <Header />
      
      <main className="flex-1">
        <div className="container-custom py-6 sm:py-8">
          {/* Breadcrumb */}
          <nav className="text-sm text-muted-foreground mb-6 flex items-center flex-wrap gap-1">
            <Link to="/" className="hover:text-primary transition-colors">Главная</Link>
            <ChevronRight className="w-3 h-3" />
            <Link to="/catalog" className="hover:text-primary transition-colors">Каталог</Link>
            {product.category && (
              <>
                <ChevronRight className="w-3 h-3" />
                <Link to={`/catalog?category=${product.category}`} className="hover:text-primary transition-colors">
                  {categoryName}
                </Link>
              </>
            )}
            <ChevronRight className="w-3 h-3" />
            <span className="text-foreground line-clamp-1">{product.name}</span>
          </nav>
          
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
            {/* Gallery */}
            <div className="space-y-4">
              <div className="relative aspect-square bg-secondary rounded-2xl overflow-hidden">
                <img
                  src={images[selectedImage]}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-4 left-4 flex flex-col gap-2">
                  {product.discount && (
                    <span className="badge-sale text-sm">-{product.discount}%</span>
                  )}
                  {product.isPremium && (
                    <span className="badge-premium text-sm">Premium</span>
                  )}
                </div>
              </div>
              
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {images.map((img, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedImage(idx)}
                      className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-colors ${
                        selectedImage === idx ? 'border-primary' : 'border-transparent'
                      }`}
                    >
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {/* Product Info */}
            <div className="space-y-6">
              <div>
                <h1 className="font-heading font-bold text-2xl sm:text-3xl mb-3">{product.name}</h1>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className={`w-5 h-5 ${i < Math.floor(product.rating) ? 'fill-gold text-gold' : 'text-muted'}`} />
                    ))}
                    <span className="ml-2 font-semibold">{product.rating}</span>
                  </div>
                  <span className="text-muted-foreground text-sm">{product.reviewsCount} отзывов</span>
                </div>
              </div>
              
              <div className="flex items-baseline gap-3">
                <span className="font-heading font-bold text-3xl sm:text-4xl text-primary">{formatPrice(product.price)}</span>
                {product.oldPrice && (
                  <span className="text-xl text-muted-foreground line-through">{formatPrice(product.oldPrice)}</span>
                )}
                {product.discount && (
                  <span className="badge-sale">-{product.discount}%</span>
                )}
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex items-center gap-3 bg-secondary rounded-lg p-1">
                  <Button variant="ghost" size="icon" onClick={() => setQuantity(Math.max(1, quantity - 1))}>
                    <Minus className="w-4 h-4" />
                  </Button>
                  <span className="w-12 text-center font-semibold">{quantity}</span>
                  <Button variant="ghost" size="icon" onClick={() => setQuantity(quantity + 1)}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                
                <Button className="flex-1 btn-gold text-base py-6" onClick={handleAddToCart} disabled={!product.inStock}>
                  <ShoppingCart className="w-5 h-5 mr-2" />
                  {product.inStock ? 'Добавить в корзину' : 'Нет в наличии'}
                </Button>
                
                <Button variant="outline" size="icon" className="w-14 h-14 flex-shrink-0" onClick={handleToggleFavorite}>
                  <Heart className={`w-6 h-6 ${favorite ? 'fill-destructive text-destructive' : ''}`} />
                </Button>
              </div>
              
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${product.inStock ? 'bg-trust' : 'bg-destructive'}`} />
                <span className="text-sm">{product.inStock ? 'В наличии' : 'Нет в наличии'}</span>
                {product.stock_count !== null && product.stock_count !== undefined && product.inStock && (
                  <span className="text-xs text-muted-foreground">({product.stock_count} шт.)</span>
                )}
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-secondary rounded-xl">
                <div className="flex items-center gap-3">
                  <Truck className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium text-sm">Доставка</p>
                    <p className="text-xs text-muted-foreground">от 1-3 дней</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <RotateCcw className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium text-sm">Возврат</p>
                    <p className="text-xs text-muted-foreground">14 дней</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium text-sm">Гарантия</p>
                    <p className="text-xs text-muted-foreground">Оригинал</p>
                  </div>
                </div>
              </div>
              
              <Accordion type="single" collapsible defaultValue="description" className="w-full">
                <AccordionItem value="description">
                  <AccordionTrigger className="font-heading font-semibold">Описание товара</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed">
                    {product.description || "Описание товара скоро появится."}
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="delivery">
                  <AccordionTrigger className="font-heading font-semibold">Доставка и оплата</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    <ul className="space-y-2">
                      <li>• Бесплатная доставка при заказе от 3000₽</li>
                      <li>• Доставка по России: 1-7 рабочих дней</li>
                      <li>• Оплата картой, СБП или при получении</li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>

          {product.seo_text && (
            <section className="mt-10">
              <h2 className="font-heading font-bold text-xl mb-4">Подробнее о товаре</h2>
              <div className="space-y-3 text-muted-foreground leading-relaxed">
                {product.seo_text.split("\n").map((line, index) => {
                  const text = line.trim();
                  if (!text) return null;
                  return <p key={index}>{text}</p>;
                })}
              </div>
            </section>
          )}

          <ProductReviewsSection productId={product.id} />
        </div>
        
        {relatedProducts.length > 0 && (
          <ProductCarousel
            title="Похожие товары"
            products={relatedProducts}
            viewAllLink={`/catalog?category=${product.category}`}
          />
        )}
      </main>
      
      <Footer />
    </div>
  );
};

function ProductReviewsSection({ productId }: { productId: string }) {
  const queryClient = useQueryClient();
  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["reviews", productId],
    queryFn: async () => {
      const params = new URLSearchParams({ productId, status: "published" });
      return apiRequest("/api/reviews?" + params.toString());
    },
  });

  return (
    <section className="mt-12 pt-12 border-t border-border">
      <h2 className="font-heading font-bold text-2xl mb-6">Отзывы ({reviews.length})</h2>
      <ReviewsList reviews={reviews} />
      <div className="mt-8">
        <ReviewForm
          productId={productId}
          onSubmitted={() => queryClient.invalidateQueries({ queryKey: ["reviews", productId] })}
        />
      </div>
    </section>
  );
}

export default ProductDetail;
