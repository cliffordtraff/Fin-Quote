interface AnalystChange {
    symbol: string;
    publishedDate: string;
    newsURL: string;
    newsTitle: string;
    newsBaseURL: string;
    newsPublisher?: string;
    analystName?: string;
    priceWhenPosted: number;
    newGrade: string;
    previousGrade: string;
    gradingCompany: string;
    action: string;
    priceTarget?: number;
    previousPriceTarget?: number;
}
interface AnalystModalProps {
    isOpen: boolean;
    onClose: () => void;
    symbol: string;
    changes?: AnalystChange[];
    loading?: boolean;
}
export default function AnalystModal({ isOpen, onClose, symbol, changes, loading }: AnalystModalProps): import("react/jsx-runtime").JSX.Element | null;
export {};
