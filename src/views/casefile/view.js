import { render } from 'preact';
import React from 'preact/compat'; // This just makes VSCode's Intellisense happy
import { useEffect, useRef, useState } from 'preact/hooks';
import { DndProvider, useDragDropManager, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { applicationOfMessagesToState } from './receivedMessages';
import { EnterAndExitTransition } from '@devclusters/fluency';
import { $casefile } from '../../datumPlans';
import Bookmark, { insertionFromClientCoords } from './bookmark';
import "./view.css";
import { MessagePasser, messagePoster } from './messageSending';
import { DRAG_TYPES } from './constants';
import { vscontext, NO_STD_CMENU_ENTRIES, when } from '../helpers';
import { DELETE_BOOKMARK, REQUEST_INITIAL_FILL, UPDATE_NOTE } from '../../messageNames';
import getMarkPath from './getMarkPath';

const vscode = acquireVsCodeApi();

const BindMessageHandling = ({ stateManagement }) => {
    useEffect(applicationOfMessagesToState(...stateManagement), []);
    return null;
};

const RequestInitialData = ({ children }) => {
    const requestInitialData = messagePoster(REQUEST_INITIAL_FILL);
    useEffect(() => {
        requestInitialData({});
    }, []);
    return <>{ children }</>;
};

const Trash = () => {
    const deleteBookmark = messagePoster(DELETE_BOOKMARK);
    const [{ cursorHovering }, trashDrop] = useDrop(() => ({
        accept: [DRAG_TYPES.BOOKMARK],
        drop: ({ itemPath }) => {
            deleteBookmark({ itemPath });
        },
        collect: (monitor) => ({
            cursorHovering: monitor.isOver({ shallow: true }),
        }),
    }));

    return (
        <div className="bookmark-trash" ref={trashDrop} data-drop-status={cursorHovering ? 'current-target' : 'none'}>
            <div><i className="codicon codicon-trash"></i><span> Remove</span></div>
        </div>
    );
};

const getDropTargetElement = ({x, y}) => {
    const elements = document.elementsFromPoint(x, y);
    for (let i = 0; i < elements.length; i++) {
        const element = elements[i].closest('.bookmark');
        if (element) {
            return element;
        }
    }
};

const getBookmarkRects = (bookmarkElt) => {
    const childrenByClass = {};
    for (let i = bookmarkElt.children.length - 1; i >= 0 ; i--) {
        const child = bookmarkElt.children[i];
        for (let j = 0; j < child.classList.length; j++) {
            const className = child.classList[j];
            childrenByClass[className] = child;
        }
    }
    const childRects = Object.fromEntries([
        'controls',
        'content',
    ].map((className) => [
        className,
        childrenByClass[className]?.getBoundingClientRect?.()
    ]));
    const treeElt = bookmarkElt.closest('.bookmark-tree');

    return {
        ...childRects,
        bookmark: bookmarkElt.getBoundingClientRect(),
        tree: treeElt.getBoundingClientRect(),
    };
};

const computeDestShadowLocation = ({ dragHover, elementRects, shadowHeight }) => {
    // Use *insertionFromClientCoords* to determine where on the target bookmark the shadow should be placed
    const insertAs = insertionFromClientCoords(dragHover, elementRects);
    const styleAttrs = ({ xParams: { left, width }, y }) => ({
        left: left + 'px',
        top: (y - shadowHeight / 2) + 'px',
        width: width + 'px',
        right: '',
        bottom: '',
    });
    if (insertAs?.siblingBefore) {
        return styleAttrs({
            xParams: elementRects.bookmark,
            y: elementRects.bookmark.top,
        });
    } else if (insertAs?.siblingAfter) {
        return styleAttrs({
            xParams: elementRects.bookmark,
            // May want to change this to the bottom of the closest ".bookmark-tree"
            y: elementRects.tree.bottom,
        });
    } else if (insertAs?.child) {
        return styleAttrs({
            xParams: elementRects.content,
            y: elementRects.bookmark.bottom,
        });
    }
};

const Bookmarks = ({ state }) => {
    const [ noteEditingStarted, setNoteEditingStarted ] = useState(undefined);
    const [ dragging, setDragging ] = useState(false);
    const dragDropManager = useDragDropManager();
    const dragMonitor = dragDropManager.getMonitor();
    useEffect(() => dragMonitor.subscribeToStateChange(() => {
        setDragging(dragMonitor.isDragging());
    }), [dragMonitor]);
    const dropShadowRef = useRef(null);
    useEffect(() => dragMonitor.subscribeToOffsetChange(() => {
        const dragHover = dragMonitor.getClientOffset();
        const dropShadowElt = dropShadowRef.current;
        if (!dropShadowElt) {
            return;
        }
        // Obtain bookmark from *dragHover* with `document.elementFromPoint()`
        // and traverse up to `.bookmark` element
        const bookmarkElt = dragHover && getDropTargetElement(dragHover);
        let shadowStyleAttrs = { top: '' };
        const dragItem = (
            (dragMonitor.getItemType() === DRAG_TYPES.BOOKMARK)
            ? dragMonitor.getItem()
            : null
        );
        if (dragHover && bookmarkElt && dragItem) {
            // Check if dragItem.id is present in itemPath of bookmarkElt -- 
            // and do not position drop shadow if so
            const draggedItemPathIndex = JSON.parse(
                bookmarkElt.dataset?.vscodeContext || '{}'
            )?.itemPath.indexOf(dragItem.id);
            if (draggedItemPathIndex < 0) {
                // Obtain client-coord DomRects for the `.controls` and
                // `.content` children of the bookmark element and the
                // overall bookmark
                const elementRects = getBookmarkRects(bookmarkElt);
                // Compute target shadow location
                shadowStyleAttrs = computeDestShadowLocation({
                    dragHover,
                    elementRects,
                    shadowHeight: dropShadowElt.offsetHeight,
                });
            }
        }
        // Move the shadow to the location
        Object.assign(dropShadowElt.style, shadowStyleAttrs);
    }), [dragMonitor]);
    const updateNote = messagePoster(UPDATE_NOTE);

    const ps = {};
    ps.editNote = () => setNoteEditingStarted(true);
    ps.activeNote = {
        editingStarted: noteEditingStarted,
        startEdit: () => setNoteEditingStarted(Date.now()),
        cancelEdit: () => setNoteEditingStarted(undefined),
        updateNote: (itemPath, newNoteContent) => {
            updateNote({ itemPath, content: newNoteContent });
            setNoteEditingStarted(undefined);
        },
    };
    return <div className="casefile-ui" {...vscontext(NO_STD_CMENU_ENTRIES)}>
        <div className="bookmarks-forest">
            {...Array.from(
                $casefile.bookmarks.getIterable(state),
                bookmark => <Bookmark tree={bookmark} key={bookmark.id} ps={ps}/>
            )}
        </div>
        { when(dragging, <div className="drop-shadow" ref={dropShadowRef} />) }
        <EnterAndExitTransition
            triggerEnter={dragging}
            triggerExit={!dragging}
            transitionNameEnter='slideInDown'
            transitionNameExit='slideOutUp'
        >
            <Trash/>
        </EnterAndExitTransition>
    </div>;
};

const View = () => {
    const stateManagement = useState({}), [ state ] = stateManagement;

    return (
        <MessagePasser value={(data) => {vscode.postMessage(data);}}>
            <RequestInitialData>
                <BindMessageHandling {...{ stateManagement }} />
            </RequestInitialData>
            <DndProvider backend={HTML5Backend}>
                <Bookmarks {...{ state }}/>
            </DndProvider>
        </MessagePasser>
    );
};

render(<View />, document.body);

