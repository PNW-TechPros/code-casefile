import React from 'preact/compat'; // This just makes VSCode's Intellisense happy
import { omit, thru } from 'lodash';
import { useRef } from 'preact/hooks';
import { useDrag, useDrop } from 'react-dnd';
import { $bookmark } from "../../datumPlans";
import { MOVE_BOOKMARK, OPEN_BOOKMARK } from "../../messageNames";
import { DRAG_TYPES } from './constants';
import { messagePoster } from './messageSending';
import { vscontext } from '../helpers';

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
const MarkInfo = ({ bookmark, ancestors = [], dragging, drag, folding }) => {
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
    const markContent = (
        $bookmark.file.get(bookmark)
        ? (
            <div
                {...vscontext({
                    webviewArea: 'bookmark',
                    itemPath: [...ancestors, bookmark.id],
                    hasChildMarks: Boolean(bookmark.children?.length),
                })}
                onClick={openThis}
            >
                <LineRef bookmark={bookmark}/>
                <TargetText bookmark={bookmark}/>
            </div>
        )
        : <h3>{$bookmark.markText.get(bookmark)}</h3>
    );
    const controls = [
        <span ref={drag}>
            <i className="codicon codicon-gripper"></i>
        </span>
    ];
    const foldingIcon = FOLDING_ICON_MAP[folding];
    if (foldingIcon && folding !== 'default') {
        controls.push(<i className={`codicon codicon-${foldingIcon}`}></i>);
    } else {
        controls.push(<i className={`codicon codicon-${FOLDING_ICON_MAP.default}`}></i>);
    }

    return (
        <div className={`bookmark ${dragging ? 'dragging-bookmark' : ''}`} ref={drop}>
            <div className="controls" ref={controlsDom}>{controls}</div>
            <div className="content" ref={contentDom}>
                {markContent}
            </div>
        </div>
    );
};

const Bookmark = ({ tree: treeNode, ancestors = [], ancestorDragging = false }) => {
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
                {...{ ancestors, drag, folding }}
            />
            {...shownChildren}
        </div>
    );
};

export default Bookmark;
