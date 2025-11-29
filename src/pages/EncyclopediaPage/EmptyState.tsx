import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Search } from "lucide-react";
import { useTranslation } from "@/i18n";

interface EmptyStateProps {
  onAddClick: () => void;
}

export function EmptyState({ onAddClick }: EmptyStateProps) {
  const { t } = useTranslation();

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12 md:py-16">
        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
          <Search className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold mb-2">{t.encyclopedia.emptyState.title}</h2>
        <p className="text-muted-foreground text-center max-w-md text-sm mb-4">
          {t.encyclopedia.emptyState.description}
        </p>
        <Button
          onClick={onAddClick}
          variant="outline"
          className="flex flex-row items-center justify-center gap-2 border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30 group"
        >
          <div className="w-8 h-8 rounded-full bg-muted/30 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
            <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <span className="text-sm text-muted-foreground group-hover:text-primary transition-colors">
            {t.encyclopedia.emptyState.addButton}
          </span>
        </Button>
      </CardContent>
    </Card>
  );
}

