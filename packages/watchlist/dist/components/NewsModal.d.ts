interface NewsArticle {
    title: string;
    url: string;
    source: string;
    publishedAt: string;
    summary: string;
}
interface NewsModalProps {
    isOpen: boolean;
    onClose: () => void;
    symbol: string;
    articles: NewsArticle[];
    loading?: boolean;
}
export default function NewsModal({ isOpen, onClose, symbol, articles, loading }: NewsModalProps): import("react").ReactPortal | null;
export {};
