'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export default function TopicBadge({ topics = [], maxDisplay = 3, onTopicClick, size = 'sm' }) {
    if (!topics || topics.length === 0) {
        return null;
    }
    const displayTopics = topics.slice(0, maxDisplay);
    const hasMore = topics.length > maxDisplay;
    const extraCount = topics.length - maxDisplay;
    const sizeClasses = size === 'sm'
        ? 'text-xs px-2 py-0.5'
        : 'text-sm px-2.5 py-1';
    return (_jsxs("div", { className: "flex items-center gap-1.5 flex-wrap", children: [displayTopics.map((topic) => {
                const isClickable = !!onTopicClick;
                const BadgeContent = (_jsx("span", { className: `
              inline-flex items-center rounded-full font-medium
              transition-colors duration-150
              ${sizeClasses}
              ${isClickable
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 cursor-pointer'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}
            `, children: topic }));
                if (isClickable) {
                    return (_jsx("button", { onClick: (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onTopicClick(topic);
                        }, onKeyDown: (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                onTopicClick(topic);
                            }
                        }, className: "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded-full", "aria-label": `Filter by ${topic}`, tabIndex: 0, children: BadgeContent }, topic));
                }
                return _jsx("span", { children: BadgeContent }, topic);
            }), hasMore && (_jsxs("span", { className: `
            inline-flex items-center rounded-full font-medium
            bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400
            ${sizeClasses}
          `, "aria-label": `${extraCount} more topics`, children: ["+", extraCount] }))] }));
}
