import { useParams, Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { ArticleJsonLd } from "@/components/ArticleJsonLd";
import { ProductCard } from "@/components/ProductCard";
import { useArticleBySlug } from "@/hooks/useArticles";
import { useProducts } from "@/hooks/useProducts";
import { useMemo } from "react";
import { ArrowLeft } from "lucide-react";

function renderMarkdown(text: string) {
  return text
    .split("\n")
    .map((line) => {
      if (line.startsWith("## ")) return `<h2 class="font-heading font-bold text-xl mt-6 mb-3">${line.slice(3)}</h2>`;
      if (line.startsWith("### ")) return `<h3 class="font-heading font-semibold text-lg mt-4 mb-2">${line.slice(4)}</h3>`;
      if (line.startsWith("— ") || line.startsWith("- ")) return `<li class="ml-4">${line.slice(2)}</li>`;
      if (line.trim() === "") return "<br/>";
      let processed = line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
      processed = processed.replace(/\*(.*?)\*/g, "<em>$1</em>");
      return `<p class="mb-2">${processed}</p>`;
    })
    .join("");
}

const ArticleDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const { data: article, isLoading, isError } = useArticleBySlug(slug);
  const { data: products = [] } = useProducts();

  const relatedProducts = useMemo(() => {
    if (!article?.related_product_ids?.length) return [];
    return products.filter((p) => article.related_product_ids.includes(p.id));
  }, [article, products]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Загрузка...</p>
        </main>
        <Footer />
      </div>
    );
  }

  if (isError || !article) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Статья не найдена</p>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <SEO
        title={article.meta_title || article.title}
        description={article.meta_description || article.excerpt || ""}
        image={article.cover_image || undefined}
        type="article"
      />
      <ArticleJsonLd article={article} />
      <Header />
      <main className="flex-1">
        <div className="container-custom py-6 sm:py-10 max-w-3xl mx-auto">
          <Link to="/articles" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Все статьи
          </Link>

          <Badge variant="secondary" className="mb-3">{article.category}</Badge>
          <h1 className="font-heading font-bold text-2xl sm:text-3xl mb-4">{article.title}</h1>

          {article.cover_image && (
            <img
              src={article.cover_image}
              alt={article.title}
              className="w-full rounded-xl mb-6 aspect-[2/1] object-cover"
            />
          )}

          <div
            className="prose prose-sm max-w-none text-foreground leading-relaxed"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(article.content) }}
          />

          {relatedProducts.length > 0 && (
            <div className="mt-10">
              <h2 className="font-heading font-bold text-lg mb-4">Связанные товары</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {relatedProducts.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default ArticleDetail;
