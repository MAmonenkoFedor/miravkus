import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/integrations/api/client";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { SEO } from "@/components/SEO";
import { Skeleton } from "@/components/ui/skeleton";

const InfoPage = () => {
  const { slug } = useParams<{ slug: string }>();

  const { data: page, isLoading } = useQuery({
    queryKey: ["page", slug],
    queryFn: async () => {
      return apiRequest(`/api/pages/${slug}`);
    },
    enabled: !!slug,
  });

  const renderContent = (content: string) => {
    return content.split("\n").map((line, i) => {
      const trimmed = line.trim();
      if (!trimmed) return <br key={i} />;
      if (trimmed.startsWith("## "))
        return (
          <h2 key={i} className="font-heading font-bold text-xl sm:text-2xl mt-8 mb-3 text-foreground">
            {trimmed.replace("## ", "")}
          </h2>
        );
      if (trimmed.startsWith("**") && trimmed.endsWith("**"))
        return (
          <p key={i} className="font-semibold text-foreground mt-4 mb-1">
            {trimmed.replace(/\*\*/g, "")}
          </p>
        );
      if (trimmed.startsWith("— "))
        return (
          <div key={i} className="flex items-start gap-2 ml-2 my-1">
            <span className="text-accent mt-0.5">—</span>
            <span className="text-muted-foreground">{trimmed.replace("— ", "")}</span>
          </div>
        );
      return (
        <p key={i} className="text-muted-foreground leading-relaxed">
          {trimmed}
        </p>
      );
    });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <SEO title={page?.title || "Загрузка..."} description={page?.content?.slice(0, 150) || ""} />
      <Header />
      <main className="flex-1">
        <div className="container-custom py-8 sm:py-12">
          {isLoading ? (
            <div className="max-w-3xl mx-auto space-y-4">
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : !page ? (
            <div className="text-center py-20">
              <h1 className="font-heading font-bold text-2xl text-foreground mb-2">Страница не найдена</h1>
              <p className="text-muted-foreground">Запрашиваемая страница не существует.</p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto">
              <h1 className="font-heading font-bold text-2xl sm:text-3xl text-foreground mb-6">
                {page.title}
              </h1>
              <div className="space-y-1">{renderContent(page.content)}</div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default InfoPage;
