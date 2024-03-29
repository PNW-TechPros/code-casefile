import React from 'preact/compat'; // This just makes VSCode's Intellisense happy
import { omit, thru } from 'lodash';
import { useRef } from 'preact/hooks';
import { useDrag, useDrop } from 'react-dnd';
import { $bookmark } from "../../datumPlans";
import { MOVE_BOOKMARK, OPEN_BOOKMARK } from "../../messageNames";
import { BookmarkNotes } from "./bookmarkNotes";
import { DRAG_TYPES } from './constants';
import { messagePoster } from './messageSending';
import { vscontext } from '../helpers';
import { Popover } from './popover';

const LineRef = ({ bookmark }) => (
    <div className="line-ref">
        {$bookmark.file.get(bookmark)}:{$bookmark.line.get(bookmark)}
    </div>
);

const TargetText = ({ bookmark }) => (
    <div className="tagged-content">
        {$bookmark.markText.get(bookmark)}
    </div>
);

export const insertionFromClientCoords = ({x, y}, { controls, content }) => {
    try {
        if (controls.left <= x && x < controls.right) {
            const midLineY = (controls.top + controls.bottom) / 2;
            if (controls.top <= y && y < midLineY) {
                return {siblingBefore: true};
            }
            if (midLineY <= y && y < controls.bottom) {
                return {siblingAfter: true};
            }
        }
        if (content.left <= x && x < content.right) {
            const midLineY = (content.top + content.bottom) / 2;
            if (content.top <= y && y < midLineY) {
                return {siblingBefore: true};
            }
            if (midLineY <= y && y < content.bottom) {
                return {child: true};
            }
        }
        if (
            Math.min(controls.left, content.left) <= x
            && x < Math.max(controls.right, content.right)
        ) {
            const midLineY = (
                Math.min(controls.top, content.top)
                + Math.max(controls.bottom, content.bottom)
            ) / 2;
            const xInContent = content.left <= x && x < content.right;
            if (y < midLineY) {
                return {siblingBefore: true};
            } else if (xInContent) {
                return {child: true};
            }
            return {siblingAfter: true};
        }
    } catch (error) {
        if (!(error instanceof Error)) {
            error = new Error("Unexpected throw", { cause: error });
        }
        console.error(error);
        return {invalid: error};
    }
    return {invalid: true};
};

const FOLDING_ICON_MAP = {
    'collapsed': 'chevron-right',
    'expanded': 'chevron-down',
    'default': 'blank',
};
const MarkInfo = ({ bookmark, ancestors = [], dragging, drag, folding, ps = {} }) => {
    // The `messagePoster`s have to be instantiated here because they `useContext`
    const showInEditor = messagePoster(OPEN_BOOKMARK);
    const moveBookmark = messagePoster(MOVE_BOOKMARK);
    const openThis = () => {
        showInEditor({ bookmark });
    };
    const controlsDom = useRef(), contentDom = useRef();
    const itemPath = [...ancestors, bookmark.id];
    const insertionFromMonitor = (monitor) => (
        insertionFromClientCoords(
            monitor.getClientOffset(),
            {
                controls: controlsDom.current.getBoundingClientRect(),
                content: contentDom.current.getBoundingClientRect(),
            }
        )
    );
    const [, drop] = useDrop(() => ({
        accept: [DRAG_TYPES.BOOKMARK],
        canDrop: ({ id }, monitor) => (
            !itemPath.includes(id)
            && !insertionFromMonitor(monitor).invalid
        ),
        drop: ({ itemPath: subject }, monitor) => {
            const insert = insertionFromMonitor(monitor);
            const moveSpec = {
                subject,
            };
            if (insert.siblingBefore) {
                moveSpec.newParent = ancestors;
                moveSpec.position = { before: bookmark.id };
            } else if (insert.siblingAfter) {
                moveSpec.newParent = ancestors;
                moveSpec.position = { after: bookmark.id };
            } else if (insert.child) {
                moveSpec.newParent = itemPath;
            }
            console.log({ moveSpec });
            if (moveSpec.newParent) {
                moveBookmark(moveSpec);
            }
        },
    }));
    const decoration = {};

    const markContent = (
        $bookmark.file.get(bookmark)
        ? (
            <div onClick={openThis}>
                <LineRef bookmark={bookmark}/>
                <TargetText bookmark={bookmark}/>
            </div>
        )
        : <h3>{$bookmark.markText.get(bookmark)}</h3>
    );

    const controls = [
        <span ref={drag} className="drag-handle">
            <i className="codicon codicon-gripper"></i>
        </span>
    ];
    const foldingIcon = FOLDING_ICON_MAP[folding];
    if (foldingIcon && folding !== 'default') {
        controls.push(<i className={`codicon codicon-${foldingIcon}`}></i>);
    } else {
        controls.push(<i className={`codicon codicon-${FOLDING_ICON_MAP.default}`}></i>);
    }

    const updateNotes = () => {};

    const indicators = [];
    const notes = $bookmark.notes.get(bookmark) || '';
    decoration.popoverContent = <Popover.Content className="bookmark-notes-display">
        <Popover.Description renderAs="div">
            <BookmarkNotes
                itemPath={[...ancestors, bookmark.id]}
                content={notes} onContentChange={updateNotes}
                noteState={ps.activeNote}
            />
        </Popover.Description>
    </Popover.Content>;
    indicators.push(<Popover.Trigger asChild>
        <i className={`codicon codicon-note show-bookmark-notes ${notes ? '' : 'missing'}`} />
    </Popover.Trigger>);

    let result = (<div
        className={`bookmark ${dragging ? 'dragging-bookmark' : ''}`}
        ref={drop}
        {...vscontext({
            webviewArea: 'bookmark',
            itemPath: [...ancestors, bookmark.id],
            hasChildMarks: Boolean(bookmark.children?.length),
        })}
    >
        <div className="controls" ref={controlsDom}>{controls}</div>
        <div className="content" ref={contentDom}>
            <div className="indicators">{indicators}</div>
            {markContent}
        </div>
    </div>);
    if (decoration.popoverContent) {
        const notesBorderColor = getComputedStyle(
            document.documentElement
        ).getPropertyValue('--codecasefile-notes-foreground').trim();
        result = <Popover useArrow={notesBorderColor} offset={15} arrowAspectRatio={0.4}>
            {result}
            {decoration.popoverContent}
        </Popover>;
    }
    return result;
};

const Bookmark = ({ tree: treeNode, ancestors = [], ancestorDragging = false, ps = {} }) => {
    const nodeIdPath = [...ancestors, treeNode.id];
    const [{ isDragging }, drag, preview] = useDrag(() => ({
        type: DRAG_TYPES.BOOKMARK,
        item: { id: treeNode.id, itemPath: nodeIdPath },
        collect: (monitor) => ({
            isDragging: Boolean(monitor.isDragging()),
        }),
    }));
    const collapsed = $bookmark.collapsed.get(treeNode);
    const shownChildren = (
        collapsed
        ? []
        : Array.from(
            $bookmark.children.getIterable(treeNode),
            subTree => (
                <Bookmark
                    tree={subTree}
                    key={subTree.id}
                    ancestors={nodeIdPath}
                    ancestorDragging={ancestorDragging || isDragging}
                    {...{ ps }}
                />
            )
        )
    );
    const folding = thru(null, () => {
        if (!$bookmark.children.length(treeNode)) {
            return 'none';
        }
        if (collapsed) {
            return 'collapsed';
        }
        return 'expanded';
    });
    return (
        <div ref={preview} className="bookmark-tree">
            <MarkInfo
                bookmark={omit(treeNode, ['children'])}
                dragging={ancestorDragging || isDragging}
                {...{ ancestors, drag, folding, ps }}
            />
            {...shownChildren}
        </div>
    );
};

export default Bookmark;
