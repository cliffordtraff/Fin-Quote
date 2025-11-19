import { Topic } from '@watchlist/config/topics';
interface TopicFilterProps {
    selectedTopics: Topic[];
    onTopicToggle: (topic: Topic) => void;
    topicCounts?: Record<string, number>;
    totalCount: number;
}
export default function TopicFilter({ selectedTopics, onTopicToggle, topicCounts, totalCount }: TopicFilterProps): import("react/jsx-runtime").JSX.Element;
export {};
