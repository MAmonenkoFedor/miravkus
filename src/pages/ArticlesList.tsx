import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useArticles } from "@/hooks/useArticles";

const ArticlesList = () => {
  const { data: articles = [], isLoading } = useArticles(true);

  return (
    <div className="min-h-screen flex flex-col">
      <SEO title="Мир вкуса — Статьи" description="Статьи о сладостях, обзоры новинок и полезные советы." />
      <Header />
      <main className="flex-1">
        <div className="container-custom py-6 sm:py-10">
          <h1 className="font-heading font-bold text-2xl sm:text-3xl mb-6">📖 Мир вкуса</h1>

          {isLoading ? (
            <p className="text-muted-foreground">Загрузка...</p>
          ) : articles.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">Статей пока нет</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {articles.map((article) => (
                <Link key={article.id} to={`/article/${article.slug}`}>
                  <Card className="overflow-hidden hover:shadow-hover transition-all duration-300 group h-full">
                    {article.cover_image ? (
                      <div className="aspect-[16/9] overflow-hidden">
                        <img
                          src={article.cover_image}
                          alt={article.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div className="aspect-[16/9] bg-muted flex items-center justify-center">
                        <span className="text-4xl">📖</span>
                      </div>
                    )}
                    <div className="p-5 space-y-2">
                      <Badge variant="secondary" className="text-xs">{article.category}</Badge>
                      <h2 className="font-heading font-semibold line-clamp-2">{article.title}</h2>
                      {article.excerpt && (
                        <p className="text-sm text-muted-foreground line-clamp-3">{article.excerpt}</p>
                      )}
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default ArticlesList;
