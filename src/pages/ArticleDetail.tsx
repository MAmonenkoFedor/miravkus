import { useParams, Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { ArticleJsonLd } from "@/components/ArticleJsonLd";
import { ProductCard } from "@/components/ProductCard";
import { useArticleBySlug } from "@/hooks/useArticles";
import { useProducts } from "@/hooks/useProducts";
import { useMemo, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

function renderInline(text: string) {
  const nodes: ReactNode[] = [];
  let i = 0;
  let key = 0;

  const pushText = (value: string) => {
    if (!value) return;
    nodes.push(<span key={`t-${key++}`}>{value}</span>);
  };

  while (i < text.length) {
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end !== -1) {
        const value = text.slice(i + 2, end);
        nodes.push(<strong key={`b-${key++}`}>{value}</strong>);
        i = end + 2;
        continue;
      }
    }

    if (text[i] === "*") {
      const end = text.indexOf("*", i + 1);
      if (end !== -1) {
        const value = text.slice(i + 1, end);
        nodes.push(<em key={`i-${key++}`}>{value}</em>);
        i = end + 1;
        continue;
      }
    }

    const next = (() => {
      const bold = text.indexOf("**", i);
      const italic = text.indexOf("*", i);
      const candidates = [bold, italic].filter((v) => v !== -1);
      return candidates.length ? Math.min(...candidates) : -1;
    })();

    if (next === -1) {
      pushText(text.slice(i));
      break;
    }

    pushText(text.slice(i, next));
    i = next;
  }

  return nodes;
}

function renderMarkdown(text: string) {
  const lines = (text ?? "").split("\n");
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let key = 0;

  const flushList = () => {
    if (!list.length) return;
    const items = list;
    list = [];
    blocks.push(
      <ul key={`ul-${key++}`} className="list-disc pl-6 space-y-1 my-3">
        {items.map((item, idx) => (
          <li key={`li-${idx}`}>{renderInline(item)}</li>
        ))}
      </ul>,
    );
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (trimmed.startsWith("— ") || trimmed.startsWith("- ")) {
      list.push(trimmed.slice(2));
      continue;
    }

    flushList();

    if (!trimmed) {
      blocks.push(<div key={`br-${key++}`} className="h-3" />);
      continue;
    }

    if (trimmed.startsWith("## ")) {
      blocks.push(
        <h2 key={`h2-${key++}`} className="font-heading font-bold text-xl mt-6 mb-3">
          {trimmed.slice(3)}
        </h2>,
      );
      continue;
    }

    if (trimmed.startsWith("### ")) {
      blocks.push(
        <h3 key={`h3-${key++}`} className="font-heading font-semibold text-lg mt-4 mb-2">
          {trimmed.slice(4)}
        </h3>,
      );
      continue;
    }

    blocks.push(
      <p key={`p-${key++}`} className="mb-2">
        {renderInline(trimmed)}
      </p>,
    );
  }

  flushList();

  return blocks;
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

          <div className="prose prose-sm max-w-none text-foreground leading-relaxed">
            {renderMarkdown(article.content)}
          </div>

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
