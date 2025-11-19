'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { TOPICS } from '@watchlist/config/topics';
export default function TopicFilter({ selectedTopics, onTopicToggle, topicCounts = {}, totalCount }) {
    const isSelected = (topic) => selectedTopics.includes(topic);
    const handleKeyDown = (e, topic) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onTopicToggle(topic);
        }
    };
    return (_jsxs("div", { className: "mb-6", children: [_jsxs("div", { className: "flex items-center gap-2 mb-3", children: [_jsx("h2", { className: "text-sm font-semibold text-gray-700 dark:text-gray-300", children: "Filter by Topic:" }), selectedTopics.length > 0 && (_jsx("button", { onClick: () => selectedTopics.forEach(t => onTopicToggle(t)), className: "text-xs text-blue-600 dark:text-blue-400 hover:underline", "aria-label": "Clear all topic filters", children: "Clear all" }))] }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsxs("button", { onClick: () => selectedTopics.forEach(t => onTopicToggle(t)), onKeyDown: (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                selectedTopics.forEach(t => onTopicToggle(t));
                            }
                        }, className: `
            px-3 py-1.5 rounded-full text-sm font-medium
            transition-colors duration-150
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1
            ${selectedTopics.length === 0
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}
          `, tabIndex: 0, role: "checkbox", "aria-checked": selectedTopics.length === 0, "aria-label": `Show all articles (${totalCount})`, children: ["All (", totalCount, ")"] }), TOPICS.map((topic) => {
                        const count = topicCounts[topic] || 0;
                        const selected = isSelected(topic);
                        return (_jsxs("button", { onClick: () => onTopicToggle(topic), onKeyDown: (e) => handleKeyDown(e, topic), disabled: count === 0, className: `
                px-3 py-1.5 rounded-full text-sm font-medium
                transition-colors duration-150
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1
                ${selected
                                ? 'bg-blue-600 text-white'
                                : count === 0
                                    ? 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}
              `, tabIndex: count === 0 ? -1 : 0, role: "checkbox", "aria-checked": selected, "aria-label": `Filter by ${topic} (${count} articles)`, children: [topic, " (", count, ")"] }, topic));
                    })] }), selectedTopics.length > 0 && (_jsxs("div", { className: "mt-3 text-sm text-gray-600 dark:text-gray-400", children: ["Showing articles tagged: ", _jsx("span", { className: "font-medium", children: selectedTopics.join(', ') })] }))] }));
}
