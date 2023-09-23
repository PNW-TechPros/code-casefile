import React from 'preact/compat'; // This just makes VSCode's Intellisense happy
import { useDrag } from 'react-dnd';
import { omit, thru } from 'lodash';
import { $bookmark } from "../../datumPlans";
import { OPEN_BOOKMARK } from "../../messageNames";
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

const FOLDING_ICON_MAP = {
    'collapsed': 'chevron-right',
    'expanded': 'chevron-down',
    'default': 'blank',
};
const MarkInfo = ({ bookmark, ancestors = [], drag, folding }) => {
    // The `messagePoster`s have to be instantiated here because they `useContext`
    const showInEditor = messagePoster(OPEN_BOOKMARK);
    const openThis = () => {
        showInEditor({ bookmark });
    };
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
        <>
            <div className="controls">{controls}</div>
            <div className="content">
                {markContent}
            </div>
        </>
    );
};

const Bookmark = ({ tree: treeNode, ancestors = [] }) => {
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
                <Bookmark tree={subTree} key={subTree.id} ancestors={nodeIdPath}/>
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
        <div ref={preview} className="bookmark">
            <MarkInfo
                bookmark={omit(treeNode, ['children'])}
                {...{ ancestors, drag, folding }}
            />
            {...shownChildren}
        </div>
    );
};

export default Bookmark;
