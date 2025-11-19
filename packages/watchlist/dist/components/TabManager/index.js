'use client';
import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React, { useState, useRef } from 'react';
import ThemedButton from '@watchlist/components/primitives/Button';
import ThemedModal from '@watchlist/components/primitives/Modal';
import ThemedContextMenu from '@watchlist/components/primitives/ContextMenu';
const MAX_TABS = 20;
export default function TabManager({ tabs, activeTabIndex, onTabsChange, onActiveTabChange, isWatchlistModeActive = false, onTabReorderModeChange, userHeader, }) {
    const [editingIndex, setEditingIndex] = useState(null);
    const [editValue, setEditValue] = useState('');
    const [contextMenu, setContextMenu] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [tabReorderMode, setTabReorderMode] = useState(false);
    const [draggedVisualIndex, setDraggedVisualIndex] = useState(null); // Only for visual feedback
    // Use refs for drag state to avoid re-renders during drag
    const draggedTabIndexRef = useRef(null);
    const dropTabIndexRef = useRef(null);
    const dropPositionRef = useRef(null);
    const handleAddTab = () => {
        if (tabs.length >= MAX_TABS)
            return;
        const newTab = {
            name: `Watchlist ${tabs.length + 1}`,
            symbols: []
        };
        onTabsChange([...tabs, newTab]);
        onActiveTabChange(tabs.length);
    };
    const handleDeleteTab = (index) => {
        if (tabs.length <= 1)
            return;
        const newTabs = tabs.filter((_, i) => i !== index);
        onTabsChange(newTabs);
        if (activeTabIndex >= newTabs.length) {
            onActiveTabChange(newTabs.length - 1);
        }
        else if (activeTabIndex > index) {
            onActiveTabChange(activeTabIndex - 1);
        }
    };
    const handleRenameTab = (index) => {
        setEditingIndex(index);
        setEditValue(tabs[index].name);
    };
    const handleSaveRename = () => {
        if (editingIndex === null)
            return;
        const newTabs = [...tabs];
        newTabs[editingIndex].name = editValue.trim() || tabs[editingIndex].name;
        onTabsChange(newTabs);
        setEditingIndex(null);
        setEditValue('');
    };
    const handleCancelRename = () => {
        setEditingIndex(null);
        setEditValue('');
    };
    const handleContextMenu = (e, index) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, tabIndex: index });
    };
    const handleCloseContextMenu = () => {
        setContextMenu(null);
    };
    const handleTabDragStart = (e, index) => {
        // Set drag data
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', index.toString());
        // Use refs for drag state
        draggedTabIndexRef.current = index;
        dropTabIndexRef.current = null;
        dropPositionRef.current = null;
        // Only set visual state for opacity
        setDraggedVisualIndex(index);
    };
    const handleTabDragOver = (e, index) => {
        e.preventDefault();
        const draggedIndex = draggedTabIndexRef.current;
        if (draggedIndex === null || draggedIndex === index) {
            return;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const position = x < rect.width / 2 ? 'before' : 'after';
        // Store in refs (no re-render)
        dropTabIndexRef.current = index;
        dropPositionRef.current = position;
        // Update visual indicators using data attributes
        document.querySelectorAll('.watchlist-tab').forEach(tab => {
            tab.removeAttribute('data-drop-position');
        });
        e.currentTarget.setAttribute('data-drop-position', position);
    };
    const handleTabDrop = (e) => {
        e.preventDefault();
        const draggedIndex = draggedTabIndexRef.current;
        const dropIndex = dropTabIndexRef.current;
        const dropPosition = dropPositionRef.current;
        if (draggedIndex === null || dropIndex === null || dropPosition === null) {
            handleTabDragEnd();
            return;
        }
        // Don't move if dropping in same position
        if (draggedIndex === dropIndex) {
            handleTabDragEnd();
            return;
        }
        const newTabs = [...tabs];
        const [draggedTab] = newTabs.splice(draggedIndex, 1);
        // Simplified insertion logic
        let insertIndex = dropIndex;
        if (dropPosition === 'after') {
            insertIndex = dropIndex + (draggedIndex < dropIndex ? 0 : 1);
        }
        else {
            insertIndex = dropIndex + (draggedIndex < dropIndex ? -1 : 0);
        }
        newTabs.splice(insertIndex, 0, draggedTab);
        // Update active tab if needed
        let newActiveIndex = activeTabIndex;
        if (activeTabIndex === draggedIndex) {
            newActiveIndex = insertIndex;
        }
        else if (draggedIndex < activeTabIndex && insertIndex >= activeTabIndex) {
            newActiveIndex = activeTabIndex - 1;
        }
        else if (draggedIndex > activeTabIndex && insertIndex <= activeTabIndex) {
            newActiveIndex = activeTabIndex + 1;
        }
        onTabsChange(newTabs);
        if (newActiveIndex !== activeTabIndex) {
            onActiveTabChange(newActiveIndex);
        }
        // Clean up
        handleTabDragEnd();
    };
    const handleTabDragEnd = () => {
        // Clear all indicators
        document.querySelectorAll('.watchlist-tab').forEach(tab => {
            tab.removeAttribute('data-drop-position');
        });
        // Clear refs
        draggedTabIndexRef.current = null;
        dropTabIndexRef.current = null;
        dropPositionRef.current = null;
        // Clear visual state
        setDraggedVisualIndex(null);
    };
    // Close context menu when clicking outside
    React.useEffect(() => {
        const handleClick = () => setContextMenu(null);
        if (contextMenu) {
            document.addEventListener('click', handleClick);
            return () => document.removeEventListener('click', handleClick);
        }
    }, [contextMenu]);
    // Handle Escape key to exit tab reorder mode
    React.useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && tabReorderMode) {
                setTabReorderMode(false);
                handleTabDragEnd(); // Clean up any drag state
            }
        };
        if (tabReorderMode) {
            document.addEventListener('keydown', handleKeyDown);
            return () => document.removeEventListener('keydown', handleKeyDown);
        }
    }, [tabReorderMode]);
    // Notify parent when tab reorder mode changes
    React.useEffect(() => {
        onTabReorderModeChange === null || onTabReorderModeChange === void 0 ? void 0 : onTabReorderModeChange(tabReorderMode);
    }, [tabReorderMode, onTabReorderModeChange]);
    return (_jsxs("div", { className: "watchlist-tabs-bar bg-watchlist-tab-bar", style: {
            display: 'flex',
            alignItems: 'flex-end',
            borderBottom: 'none',
            padding: '0 8px',
            paddingTop: '20px', // Add gap at the top
            paddingBottom: '0', // Remove bottom padding so tabs extend down
            paddingRight: '16px', // Reduce padding for user header
            minHeight: '54px', // Adjust height since we removed bottom padding
            marginBottom: 0,
            position: 'relative' // For absolute positioning of user header
        }, children: [_jsxs("div", { style: {
                    display: 'flex',
                    alignItems: 'flex-end',
                    flex: 1,
                    overflowX: editingIndex !== null ? 'hidden' : 'auto' // Hide overflow during edit to prevent scroll gutter
                }, children: [tabs.map((tab, index) => (_jsx("div", { className: `watchlist-tab ${index === activeTabIndex ? 'active bg-watchlist-tab-active' : 'bg-watchlist-tab-inactive'}`, style: {
                            display: 'flex',
                            alignItems: 'center',
                            padding: '3px 8px',
                            marginRight: '4px',
                            borderRadius: '4px 4px 0 0',
                            fontSize: '14px',
                            color: 'rgb(var(--watchlist-text-primary))',
                            cursor: tabReorderMode ? 'grab' : 'pointer',
                            userSelect: 'none',
                            transition: 'all 0.2s ease',
                            fontWeight: 'normal',
                            height: '24px',
                            opacity: draggedVisualIndex === index ? 0.3 : 1,
                            position: 'relative',
                            overflow: editingIndex === index ? 'hidden' : undefined // Clip overflow during edit
                        }, draggable: tabReorderMode, onClick: () => !tabReorderMode && onActiveTabChange(index), onContextMenu: (e) => !tabReorderMode && handleContextMenu(e, index), onDragStart: (e) => {
                            if (tabReorderMode) {
                                handleTabDragStart(e, index);
                            }
                        }, onDragOver: (e) => {
                            e.preventDefault(); // Always prevent default to allow drop
                            if (tabReorderMode) {
                                handleTabDragOver(e, index);
                            }
                        }, onDrop: (e) => {
                            if (tabReorderMode) {
                                handleTabDrop(e);
                            }
                        }, onDragEnd: () => tabReorderMode && handleTabDragEnd(), children: editingIndex === index ? (_jsx("input", { type: "text", value: editValue, onChange: (e) => setEditValue(e.target.value), onBlur: handleSaveRename, onKeyDown: (e) => {
                                if (e.key === 'Enter')
                                    handleSaveRename();
                                if (e.key === 'Escape')
                                    handleCancelRename();
                            }, className: "tab-rename-input border-watchlist-border text-watchlist-text-primary focus:ring-watchlist-focus-ring", style: {
                                width: `${Math.max(editValue.length * 8, 60)}px`, // Dynamic width based on content
                                minWidth: '60px', // Minimum width for usability
                                maxWidth: '200px', // Maximum width to prevent excessive expansion
                                fontSize: '14px',
                                borderRadius: '4px',
                                padding: '2px 6px',
                                background: 'transparent', // Match dark header
                                outline: 'none', // Remove default focus outline
                                boxSizing: 'border-box', // Include padding/border in width
                                margin: 0, // Ensure no default margins
                                boxShadow: '0 0 0 2px rgb(var(--watchlist-focus-ring) / 0.3) inset' // Contained focus indicator
                            }, autoFocus: true, onClick: (e) => e.stopPropagation() })) : (_jsxs(_Fragment, { children: [tabReorderMode && (_jsxs("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", strokeLinejoin: "round", style: {
                                        marginRight: '4px',
                                        flexShrink: 0,
                                        cursor: 'grab'
                                    }, children: [_jsx("line", { x1: "12", y1: "5", x2: "12", y2: "5.01" }), _jsx("line", { x1: "12", y1: "12", x2: "12", y2: "12.01" }), _jsx("line", { x1: "12", y1: "19", x2: "12", y2: "19.01" }), _jsx("line", { x1: "7", y1: "5", x2: "7", y2: "5.01" }), _jsx("line", { x1: "7", y1: "12", x2: "7", y2: "12.01" }), _jsx("line", { x1: "7", y1: "19", x2: "7", y2: "19.01" }), _jsx("line", { x1: "17", y1: "5", x2: "17", y2: "5.01" }), _jsx("line", { x1: "17", y1: "12", x2: "17", y2: "12.01" }), _jsx("line", { x1: "17", y1: "19", x2: "17", y2: "19.01" })] })), _jsx("span", { className: "tab-name", style: {
                                        flex: 1,
                                        outline: 'none',
                                        border: 'none',
                                        background: 'transparent',
                                        color: 'inherit',
                                        fontSize: 'inherit',
                                        fontFamily: 'inherit',
                                        padding: 0,
                                        margin: 0
                                    }, children: tab.name })] })) }, index))), tabReorderMode && (_jsx(ThemedButton, { onClick: () => {
                            setTabReorderMode(false);
                            handleTabDragEnd(); // Clean up any drag state
                        }, variant: "success", size: "sm", title: "Press Escape to exit reorder mode", className: "ml-2", children: "Done" })), !tabReorderMode && tabs.length < MAX_TABS && editingIndex === null && (_jsx("button", { onClick: handleAddTab, className: "add-tab-btn bg-watchlist-tab-bar hover:bg-watchlist-button-hover text-white", style: {
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '30px',
                            height: '30px',
                            marginLeft: '4px',
                            border: 'none',
                            borderRadius: '50%',
                            fontSize: '20px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            boxShadow: 'none'
                        }, title: `Add new watchlist (${tabs.length}/${MAX_TABS})`, children: "+" }))] }), userHeader && (_jsx("div", { style: {
                    position: 'absolute',
                    top: '8px',
                    right: '16px',
                    zIndex: 100
                }, children: userHeader })), contextMenu && (_jsx(ThemedContextMenu, { x: contextMenu.x, y: contextMenu.y, onClose: handleCloseContextMenu, items: [
                    {
                        label: 'Rename',
                        onClick: () => {
                            handleRenameTab(contextMenu.tabIndex);
                            handleCloseContextMenu();
                        }
                    },
                    {
                        label: 'Reorder tabs',
                        onClick: () => {
                            if (!isWatchlistModeActive) {
                                setTabReorderMode(true);
                                handleCloseContextMenu();
                            }
                        },
                        disabled: isWatchlistModeActive,
                        title: isWatchlistModeActive ? 'Cannot reorder tabs while watchlist is in delete/reorder mode' : ''
                    },
                    ...(tabs.length > 1 ? [{
                            label: 'Delete',
                            onClick: () => {
                                setDeleteConfirm({
                                    show: true,
                                    tabIndex: contextMenu.tabIndex,
                                    tabName: tabs[contextMenu.tabIndex].name
                                });
                                handleCloseContextMenu();
                            },
                            variant: 'danger'
                        }] : [])
                ] })), (deleteConfirm === null || deleteConfirm === void 0 ? void 0 : deleteConfirm.show) && (_jsxs(ThemedModal, { isOpen: true, onClose: () => setDeleteConfirm(null), title: `Delete '${deleteConfirm.tabName}'?`, children: [_jsx("p", { className: "text-watchlist-text-secondary mb-6", children: "This action cannot be undone." }), _jsxs("div", { className: "flex gap-3 justify-end", children: [_jsx(ThemedButton, { variant: "secondary", onClick: () => setDeleteConfirm(null), children: "Cancel" }), _jsx(ThemedButton, { variant: "danger", onClick: () => {
                                    handleDeleteTab(deleteConfirm.tabIndex);
                                    setDeleteConfirm(null);
                                }, children: "Delete" })] })] }))] }));
}
