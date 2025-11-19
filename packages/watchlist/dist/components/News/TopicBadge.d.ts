import { Topic } from '@watchlist/config/topics';
interface TopicBadgeProps {
    topics?: Topic[];
    maxDisplay?: number;
    onTopicClick?: (topic: Topic) => void;
    size?: 'sm' | 'md';
}
export default function TopicBadge({ topics, maxDisplay, onTopicClick, size }: TopicBadgeProps): import("react/jsx-runtime").JSX.Element | null;
export {};
