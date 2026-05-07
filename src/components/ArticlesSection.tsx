import { Link } from "react-router-dom";
import { useArticles } from "@/hooks/useArticles";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";

export function ArticlesSection() {
  const { data: articles = [] } = useArticles(true);

  if (articles.length === 0) return null;

  const displayed = articles.slice(0, 4);

  return (
    <section className="py-8 sm:py-12">
      <div className="container-custom">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-heading font-bold text-xl sm:text-2xl">
            📖 Мир вкуса
          </h2>
          <Link
            to="/articles"
            className="text-sm font-medium text-primary hover:text-accent transition-colors flex items-center gap-1"
          >
            Все статьи <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {displayed.map((article) => (
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
                    <span className="text-3xl">📖</span>
                  </div>
                )}
                <div className="p-4 space-y-2">
                  <Badge variant="secondary" className="text-xs">{article.category}</Badge>
                  <h3 className="font-heading font-semibold text-sm line-clamp-2">{article.title}</h3>
                  {article.excerpt && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{article.excerpt}</p>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
